import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);
  const [currentOverdueCount, setCurrentOverdueCount] = useState(0); // Contador de pendências

  const filterDropdownRef = useRef(null);

  // Define os cabeçalhos da tabela na ordem desejada
  const defaultTableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços extras)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str);
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Formata a data de hoje para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    // Verifica se está vazio ou se contém "falta abonar" (normalizado)
    return justificativa === '' || normalizeForComparison(justificativa) === 'falta abonar';
  }, [normalizeForComparison]);

  // Retorna a classe CSS para a linha da tabela com base no status da OS
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return ''; // Sem classe para linhas padrão (fundo padrão do CSS)
  }, [isOverdue, isDueToday]);

  // Retorna o estilo para a célula 'Justificativa do Abono' na tabela web
  const getJustificativaCellStyle = useCallback((row) => {
    // Aplica o estilo roxo apenas se a OS estiver atrasada E a condição de abonar for verdadeira
    if (isOverdue(row) && isAbonarCondition(row)) {
      return { backgroundColor: '#800080', color: 'white', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, isAbonarCondition]);

  // Retorna o texto para a célula 'Justificativa do Abono' na tabela web
  const getJustificativaCellText = useCallback((row) => {
    // Exibe "FALTA ABONAR" apenas se a OS estiver atrasada E a condição de abonar for verdadeira
    if (isOverdue(row) && isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, isAbonarCondition]);

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders([]);

    const formData = new FormData();
    // CORREÇÃO: Usando 'file' como nome do campo, conforme o backend provavelmente espera
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler o erro como JSON primeiro, depois como texto
        let errorMsg = `Erro no servidor: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg += ` - ${errorData.error || JSON.stringify(errorData)}`;
        } catch {
          const errorText = await response.text();
          errorMsg += ` - ${errorText}`;
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders); // Define os cabeçalhos na ordem desejada
        // Resetar filtros e ordenação ao carregar novos dados
        setSortColumn('Data Limite');
        setSortDirection('asc');
        setSearchTerm('');
        setSelectedFilterOptions({
          'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
        });
        setActiveFilterColumn(null);
      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Falha ao carregar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Função para lidar com a mudança de arquivo selecionado
  const handleFileChange = useCallback((event) => {
    setFile(event.target.files[0]);
    setData([]); // Limpa os dados da tabela ao selecionar um novo arquivo
    setError(''); // Limpa qualquer erro anterior
  }, []);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDirection =>
      column === sortColumn ? (prevDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Função para lidar com a pesquisa
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Função para popular as opções de filtro dinamicamente
  useEffect(() => {
    const newFilterOptions = {};
    tableHeaders.forEach(header => {
      if (header !== 'Justificativa do Abono' && header !== 'CNPJ / CPF' && header !== 'Data Limite') {
        const options = [...new Set(data.map(row => String(row[header]).trim()))].filter(Boolean).sort();
        newFilterOptions[header] = options;
      }
    });
    setFilterOptions(newFilterOptions);
  }, [data, tableHeaders]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prevColumn => (prevColumn === column ? null : column));
  }, []);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prevSelected => {
      const currentOptions = prevSelected[column] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prevSelected,
          [column]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prevSelected,
          [column]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Função para limpar o filtro de uma coluna
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prevSelected => ({
      ...prevSelected,
      [column]: [] // Limpa todas as opções selecionadas para a coluna
    }));
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtrar por termo de busca
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = String(row[header] || '');
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // 2. Filtrar por opções de coluna
    tableHeaders.forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.includes(String(row[header]).trim())
        );
      }
    });

    // 3. Ordenar
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        } else {
          const normalizedA = normalizeForComparison(aValue);
          const normalizedB = normalizeForComparison(bValue);

          if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
          if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    // Atualiza o contador de pendências atrasadas
    const count = currentData.filter(row => isOverdue(row) || isDueToday(row)).length;
    setCurrentOverdueCount(count);

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison, isOverdue, isDueToday]);

  // Função para exportar os dados filtrados para Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as linhas que são "Pendentes Hoje" (atrasadas ou vencendo hoje)
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas ou vencendo hoje para exportar.');
      return;
    }

    // Prepara os dados para a planilha, incluindo os cabeçalhos na primeira linha
    const ws_data = [
      tableHeaders, // Primeira linha: cabeçalhos
      ...filteredForExport.map(row =>
        tableHeaders.map(header => {
          let cellValue = row[header];

          // Tratamento especial para 'Justificativa do Abono'
          if (header === 'Justificativa do Abono') {
            return getJustificativaCellText(row); // Retorna o texto já formatado ("FALTA ABONAR" ou original)
          }
          // Tratamento especial para 'Data Limite'
          if (header === 'Data Limite') {
            const date = parseDateForComparison(cellValue);
            if (date && !isNaN(date)) {
              // Converte a data para o número de série do Excel manualmente
              const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
              const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
              const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
              return excelDate; // Retorna o número de série
            }
            return cellValue; // Retorna o valor original se não for uma data válida
          }
          // Tratamento especial para 'CNPJ / CPF'
          if (header === 'CNPJ / CPF') {
            return String(cellValue || '').replace(/['"=]/g, '').trim(); // Remove caracteres indesejados
          }
          return cellValue; // Retorna o valor original para outras colunas
        })
      )
    ];

    // Cria a planilha a partir do array de arrays
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // --- Definição e Aplicação de Estilos ---

    // Larguras das colunas
    ws['!cols'] = [
      { wch: 12 }, // Chamado
      { wch: 18 }, // Numero Referencia
      { wch: 15 }, // Contratante
      { wch: 30 }, // Serviço
      { wch: 18 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 25 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 18 }, // Cidade
      { wch: 20 }, // Técnico
      { wch: 20 }, // Prestador
      { wch: 30 }, // Justificativa do Abono
    ];

    // Estilos de célula para o Excel
    const headerStyle = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const overdueRowBaseStyle = {
      font: { name: "Calibri", sz: 11, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "C00000" } }, // Vermelho intenso
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const dueTodayRowBaseStyle = {
      font: { name: "Calibri", sz: 11, color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "FFC000" } }, // Amarelo
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const defaultRowBaseStyle = {
      font: { name: "Calibri", sz: 11, color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "E0F2F7" } }, // Azul claro suave
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const abonarCellStyle = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "800080" } }, // Roxo intenso
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Itera sobre as células para aplicar estilos
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Garante que a célula exista

        let currentCellStyle = {}; // Estilo para a célula atual

        if (R === 0) { // Linha do cabeçalho
          currentCellStyle = { ...headerStyle };
        } else { // Linhas de dados (R > 0)
          const originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
          let baseStyleForDataRow = { ...defaultRowBaseStyle }; // Começa com o estilo padrão de linha de dados

          if (isOverdue(originalRowData)) {
            baseStyleForDataRow = { ...overdueRowBaseStyle };
          } else if (isDueToday(originalRowData)) {
            baseStyleForDataRow = { ...dueTodayRowBaseStyle };
          }
          currentCellStyle = { ...baseStyleForDataRow }; // Aplica o estilo base da linha

          const header = tableHeaders[C];

          // Sobrescreve o estilo da célula "Justificativa do Abono" se for "FALTA ABONAR"
          if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            currentCellStyle = { ...abonarCellStyle };
          }
          // Formatação de Data Limite
          else if (header === 'Data Limite') {
            currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          }
          // Formatação de CNPJ / CPF
          else if (header === 'CNPJ / CPF') {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
            currentCellStyle.numFmt = '@'; // Força formato de texto
          }
          // Alinhamento para outras colunas de texto
          else if (['Serviço', 'Contratante', 'Cliente', 'Cidade', 'Técnico', 'Prestador'].includes(header)) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
          }
          // Alinhamento padrão para outras colunas (ex: Chamado, Numero Referencia, Status)
          else {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          }
        }
        ws[cellAddress].s = currentCellStyle; // Aplica o estilo final à célula
      }
    }

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cria o workbook e adiciona a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // Define a cor da aba "Pendentes"
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
    wb.Workbook.Views[0].TabColor = { rgb: "4472C4" }; // Azul escuro

    // Gera o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);

  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, getJustificativaCellText, parseDateForComparison, normalizeForComparison, todayFormatted, isAbonarCondition]);


  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div className="logo-and-title">
            {/* Você pode adicionar um logo aqui se desejar */}
            <h1>Painel de Pendências</h1>
          </div>

          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange} // Usando handleFileChange
                className="file-input"
                id="csvFileInput"
              />
              <label htmlFor="csvFileInput" className="upload-action-button">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              {file && <span className="file-name">{file.name}</span>} {/* Exibe o nome do arquivo selecionado */}
              <button onClick={handleUpload} disabled={!file || loading} className="action-button">
                {loading ? 'Carregando...' : 'Processar CSV'}
              </button>
            </div>

            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar em toda a tabela..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <button onClick={exportToExcel} disabled={filteredAndSortedData.length === 0} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
              </button>
            </div>
          </div>
        </div>
        {error && <p className="error-message">Erro: {error}</p>}
      </header>

      {data.length > 0 && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total de Pendências</h3>
            <p>{currentOverdueCount}</p>
          </div>
          <div className="card">
            <h3>Chamados Atrasados</h3>
            <p>{filteredAndSortedData.filter(row => isOverdue(row)).length}</p>
          </div>
          <div className="card">
            <h3>Vencendo Hoje</h3>
            <p>{filteredAndSortedData.filter(row => isDueToday(row)).length}</p>
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? (
                            <FontAwesomeIcon icon={faSortUp} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSortDown} className="sort-icon" />
                          )
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
                            : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
