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
  // Novo estado para armazenar o contador de pendências
  const [currentOverdueCount, setCurrentOverdueCount] = useState(0); // Inicializa com 0

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

  // Verifica se a justificativa do abono está vazia ou contém "falta abonar"
  const isAbonarCell = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').toLowerCase().trim();
    return justificativa === '' || normalizeForComparison(justificativa).includes('falta abonar');
  }, [normalizeForComparison]);

  // Retorna a classe CSS para a linha da tabela com base no status da OS
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul claro suave
  }, [isOverdue, isDueToday]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  const getJustificativaCellStyle = useCallback((row) => {
    if (isOverdue(row) && isAbonarCell(row)) {
      // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
      // Para células "Falta Abonar" em linhas atrasadas, o roxo prevalece.
      return { backgroundColor: '#800080', color: 'white', fontWeight: 'bold' }; // Roxo intenso
    }
    if (isAbonarCell(row)) {
      return { backgroundColor: '#800080', color: 'white', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, isAbonarCell]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCell(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isAbonarCell]);

  // Efeito para buscar os dados iniciais ou quando o arquivo muda
  useEffect(() => {
    if (data.length > 0) {
      // Extrai todos os valores únicos para cada cabeçalho para os filtros
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        const options = [...new Set(data.map(row => String(row[header] || '')))].sort((a, b) => a.localeCompare(b));
        newFilterOptions[header] = options;
      });
      setFilterOptions(newFilterOptions);

      // Define os cabeçalhos da tabela com base nos dados, mantendo a ordem padrão
      const headersInData = Object.keys(data[0] || {});
      const orderedHeaders = defaultTableHeaders.filter(header => headersInData.includes(header));
      setTableHeaders(orderedHeaders.length > 0 ? orderedHeaders : defaultTableHeaders);
    } else {
      setFilterOptions({});
      setTableHeaders(defaultTableHeaders);
    }
  }, [data, defaultTableHeaders]);

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro no servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Memória: "User wants the Cliente column to be correctly populated from the CSV data"
      // A lógica de mapeamento e preenchimento da coluna Cliente já está no backend.
      if (result && result.length > 0) { // Verifica se o array de resultados não está vazio
        setData(result); // Define os dados diretamente do resultado
        // Após carregar os dados, define a coluna de ordenação padrão e direção
        setSortColumn('Data Limite');
        setSortDirection('asc');
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
  }, [file, backendUrl]);

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
  }, [sortColumn]); // Adicionado sortColumn como dependência

  // Função para alternar a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((header) => {
    setActiveFilterColumn(prevColumn => (prevColumn === header ? null : header));
  }, []);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prevSelected => {
      const currentOptions = prevSelected[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prevSelected,
          [header]: currentOptions.filter(item => item !== option),
        };
      } else {
        return {
          ...prevSelected,
          [header]: [...currentOptions, option],
        };
      }
    });
  }, []);

  // Função para aplicar os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    // A lógica de filtragem é aplicada no useMemo filteredAndSortedData
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Função para limpar os filtros de uma coluna específica
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prevSelected => ({
      ...prevSelected,
      [header]: [], // Limpa todas as opções selecionadas para esta coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
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
  }, [filterDropdownRef]); // Removido toggleFilterDropdown pois setActiveFilterColumn é estável

  // Filtra e ordena os dados para exibição na tabela
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    // Aplica a pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filtered = filtered.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(String(row[header] || '')).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica os filtros de coluna
    filtered = filtered.filter(row => {
      return tableHeaders.every(header => {
        const selected = selectedFilterOptions[header];
        if (!selected || selected.length === 0) {
          return true; // Se não há filtros selecionados para esta coluna, inclui a linha
        }
        return selected.includes(String(row[header] || ''));
      });
    });

    // Calcula o contador de pendências aqui
    const count = filtered.filter(row => isOverdue(row) || isDueToday(row)).length;
    setCurrentOverdueCount(count); // Atualiza o estado do contador

    // Aplica a ordenação
    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Lógica de ordenação padrão para outros tipos de coluna
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      // Para outros tipos (números, etc.), tenta uma comparação direta
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [data, searchTerm, selectedFilterOptions, tableHeaders, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison, isOverdue, isDueToday]);

  // Função para exportar os dados filtrados e ordenados para Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as linhas que são "Pendentes Hoje" (atrasadas ou vencendo hoje)
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas ou vencendo hoje para exportar.');
      return;
    }

    const ws_data = [
      tableHeaders, // Cabeçalhos
      ...filteredForExport.map(row =>
        tableHeaders.map(header => {
          let cellValue = row[header];

          // Tratamento especial para 'Justificativa do Abono'
          if (header === 'Justificativa do Abono') {
            return getJustificativaCellText(row);
          }
          // Tratamento especial para 'Data Limite'
          if (header === 'Data Limite') {
            const date = parseDateForComparison(cellValue);
            if (date && !isNaN(date)) {
              // Converte a data para o número de série do Excel manualmente
              const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
              const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
              const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
              return excelDate;
            }
          }
          // Tratamento especial para 'CNPJ / CPF'
          if (header === 'CNPJ / CPF') {
            return String(cellValue || '').replace(/['"=]/g, '').trim();
          }
          return cellValue;
        })
      )
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Definir larguras das colunas
    const wscols = [
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
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    const headerStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: "FFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };

    // Aplicar estilo aos cabeçalhos
    tableHeaders.forEach((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = headerStyle;
    });

    // Estilos para as linhas de dados
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; ++R) { // Começa da segunda linha (índice 1)
      const originalRowData = filteredForExport[R - 1]; // Pega os dados da linha original
      if (!originalRowData) continue; // Garante que a linha existe

      const isRowOverdue = isOverdue(originalRowData);
      const isRowDueToday = isDueToday(originalRowData);

      let rowBaseStyle = {
        font: { name: 'Calibri', sz: 11, color: { rgb: "000000" } }, // Padrão preto
        fill: { fgColor: { rgb: "E0F2F7" } }, // Azul claro suave
        alignment: { vertical: "center", wrapText: false },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };

      if (isRowOverdue) {
        rowBaseStyle.fill.fgColor.rgb = "C00000"; // Vermelho intenso
        rowBaseStyle.font.color.rgb = "FFFFFF"; // Texto branco
      } else if (isRowDueToday) {
        rowBaseStyle.fill.fgColor.rgb = "FFC000"; // Amarelo
        rowBaseStyle.font.color.rgb = "000000"; // Texto preto
      }

      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Garante que a célula existe
        if (!ws[cellAddress].s) ws[cellAddress].s = {}; // Garante que o objeto de estilo existe

        // Aplica o estilo base da linha
        Object.assign(ws[cellAddress].s, rowBaseStyle);

        // Estilos específicos por coluna
        const header = tableHeaders[C];
        if (header === 'Data Limite') {
          ws[cellAddress].s.numFmt = 'DD/MM/YYYY';
          ws[cellAddress].s.alignment.horizontal = "center";
          ws[cellAddress].t = 'n'; // Tipo numérico para datas
        } else if (header === 'CNPJ / CPF') {
          ws[cellAddress].s.alignment.horizontal = "left";
          ws[cellAddress].t = 's'; // Tipo string para CNPJ/CPF
        } else if (header === 'Chamado' || header === 'Numero Referencia' || header === 'Status' || header === 'Cidade') {
          ws[cellAddress].s.alignment.horizontal = "center";
          ws[cellAddress].t = 's'; // Tipo string para esses campos
        } else {
          ws[cellAddress].s.alignment.horizontal = "left"; // Padrão para texto
          ws[cellAddress].t = 's'; // Tipo string para outros campos
        }

        // Estilo especial para "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && isAbonarCell(originalRowData)) {
          ws[cellAddress].s.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          ws[cellAddress].s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: "FFFFFF" } }; // Branco, negrito
          ws[cellAddress].s.alignment.horizontal = "center";
          ws[cellAddress].t = 's'; // Tipo string
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // AutoFiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congelar Painéis (primeira linha)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cor da Aba
    if (wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[0]) {
      wb.Workbook.Sheets[0].TabColor = { rgb: "4472C4" }; // Azul escuro
    } else {
      // Fallback para versões mais antigas ou estruturas diferentes
      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
      wb.Workbook.Sheets.push({ TabColor: { rgb: "4472C4" } });
    }


    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, todayFormatted, parseDateForComparison, isOverdue, isDueToday, getJustificativaCellText, isAbonarCell]);


  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div className="logo-and-title">
            <img src="/logo.png" alt="Logo" className="app-logo" />
            <h1>Painel de Pendências</h1>
          </div>
          <div className="controls-container">
            <div className="file-upload-section">
              <label htmlFor="file-upload" className="custom-file-upload">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
              {file && <span className="file-name">{file.name}</span>}
              <button onClick={handleUpload} disabled={!file || loading}>
                {loading ? 'Carregando...' : 'Carregar Dados'}
              </button>
            </div>
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em toda a tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
            </button>
          </div>
        </div>
        {error && <p className="error-message">Erro: {error}</p>}
      </header>

      {data.length > 0 && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total de Pendências</h3>
            <p>{currentOverdueCount}</p> {/* <--- CORRIGIDO AQUI */}
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
