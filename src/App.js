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

  // Retorna a classe CSS para a linha com base no status da data
  // Memória: "User prefers table row background colors to have higher contrast with text for better readability."
  // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul claro suave
  }, [isOverdue, isDueToday]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  // Se a OS estiver atrasada e a justificativa for vazia ou 'falta abonar', exibe 'FALTA ABONAR'
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    if (isOverdue(row) && (justificativa === '' || justificativa === 'faltaabonar')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    if (isOverdue(row) && (justificativa === '' || justificativa === 'faltaabonar')) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
        textAlign: 'center'
      };
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Função para lidar com a seleção de arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError(''); // Limpa erros anteriores ao selecionar novo arquivo
  };

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

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
      // O backend já deve estar cuidando do mapeamento.
      // Memória: "User wants uploaded Mob data to retain all original columns, map Origem to "mob", Cliente to Nome Cliente, Contratante to Getnet/Punto, enforce DD/MM/YYYY dates, and follow a specific column order."
      // A lógica de mapeamento e preenchimento da coluna Cliente já está no backend.

      if (result && result.length > 0) { // Verifica se o array de resultados não está vazio
        setData(result); // Define os dados diretamente do resultado
        // Extrai os cabeçalhos únicos dos dados e os define na ordem padrão
        const extractedHeaders = Object.keys(result[0] || {});
        const orderedHeaders = defaultTableHeaders.filter(header => extractedHeaders.includes(header));
        setTableHeaders(orderedHeaders);

        // Popula as opções de filtro
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          if (header !== 'Justificativa do Abono' && header !== 'CNPJ / CPF') { // Exclui colunas que não precisam de filtro de opções
            const uniqueOptions = [...new Set(result.map(row => row[header]))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
            newFilterOptions[header] = uniqueOptions;
          }
        });
        setFilterOptions(newFilterOptions);

        // Reseta os filtros selecionados para incluir todos os status padrão
        setSelectedFilterOptions({
          'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
        });

      } else {
        setData([]);
        setTableHeaders([]);
        setFilterOptions({});
        setSelectedFilterOptions({});
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Falha ao carregar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]); // Adicionado defaultTableHeaders como dependência

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortColumn(prevColumn => {
      if (prevColumn === column) {
        setSortDirection(prevDirection => (prevDirection === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDirection('asc');
      }
      return column;
    });
  }, [sortColumn, sortDirection]); // Removido parseDateForComparison e normalizeForComparison daqui, pois não são usadas diretamente para ATUALIZAR o estado de sortColumn/sortDirection

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // 1. Filtrar por termo de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções de coluna
    currentData = currentData.filter(row => {
      return Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        }
        return selectedOptions.includes(row[column]);
      });
    });

    // 3. Ordenar
    if (sortColumn) {
      currentData = [...currentData].sort((a, b) => {
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

        // Ordenação padrão para outros tipos de dados
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);

        if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
        if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);


  // Função para exportar dados filtrados para Excel
  // Memória: "User wants exported Excel sheets to have a professional and refined aesthetic, including formatting, colors, and a clean layout."
  // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
  // Memória: "User wants exported Excel sheets to include a freeze pane for headers, autofilters, and consistent column widths."
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      setError('Não há dados para exportar.');
      return;
    }

    // Filtra os dados para exportação: apenas linhas atrasadas ou vencendo hoje
    // Memória: "User wants exported Excel sheets to only include rows that are overdue or due today."
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      setError('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    // Cria uma nova planilha a partir dos dados filtrados
    const ws = XLSX.utils.json_to_sheet(filteredForExport, { header: tableHeaders });

    // Define as larguras das colunas
    // Memória: "User wants exported Excel sheets to include a freeze pane for headers, autofilters, and consistent column widths."
    const wscols = [
      { wch: 12 }, // Chamado
      { wch: 18 }, // Numero Referencia
      { wch: 18 }, // Contratante
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

    // Estilos de célula para o Excel
    const headerStyle = {
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      font: { color: { rgb: "FFFFFF" }, bold: true, name: "Calibri", sz: 11 }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } },
      }
    };

    // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
    const overdueRowStyle = {
      fill: { fgColor: { rgb: "C00000" } }, // Vermelho intenso
      font: { color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 }, // Texto branco
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } },
      }
    };

    // Memória: "User prefers table row background colors to have higher contrast with text for better readability."
    const dueTodayRowStyle = {
      fill: { fgColor: { rgb: "FFC000" } }, // Amarelo
      font: { color: { rgb: "000000" }, name: "Calibri", sz: 11 }, // Texto preto
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } },
      }
    };

    // Memória: "User prefers table row background colors to have higher contrast with text for better readability."
    const defaultRowStyle = {
      fill: { fgColor: { rgb: "E0F2F7" } }, // Azul claro suave
      font: { color: { rgb: "000000" }, name: "Calibri", sz: 11 }, // Texto preto
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } },
      }
    };

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: header }; // Garante que a célula exista
      ws[cellAddress].s = headerStyle;
    });

    // Itera sobre as células para aplicar estilos e formatação de dados
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Começa da segunda linha (R=1)
      const originalRowData = filteredForExport[R - 1]; // Pega os dados da linha original

      // Determina o estilo base da linha
      let baseRowStyle = defaultRowStyle;
      if (isOverdue(originalRowData)) {
        baseRowStyle = overdueRowStyle;
      } else if (isDueToday(originalRowData)) {
        baseRowStyle = dueTodayRowStyle;
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const header = tableHeaders[C];
        const cellValue = originalRowData[header];

        if (!ws[cellAddress]) ws[cellAddress] = { v: '' }; // Garante que a célula exista

        // Aplica o estilo base da linha
        ws[cellAddress].s = { ...baseRowStyle };

        // Estilos e valores específicos por coluna
        if (header === 'Justificativa do Abono') {
          const justificativaText = getJustificativaCellText(originalRowData);
          ws[cellAddress].v = justificativaText;
          ws[cellAddress].t = 's'; // Tipo string

          // Se for "FALTA ABONAR", aplica o estilo roxo intenso, sobrescrevendo o estilo da linha
          if (justificativaText === 'FALTA ABONAR') {
            ws[cellAddress].s = {
              ...ws[cellAddress].s, // Mantém bordas e alinhamento vertical
              fill: { fgColor: { rgb: "800080" } }, // Roxo intenso
              font: { color: { rgb: "FFFFFF" }, bold: true, name: "Calibri", sz: 11 }, // Texto branco, negrito
              alignment: { horizontal: "center", vertical: "center", wrapText: false }
            };
          } else {
            // Para outras justificativas, alinha à esquerda
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
          }
        }
        // Estilos e valores específicos para 'Data Limite'
        else if (header === 'Data Limite') {
          const date = parseDateForComparison(cellValue);
          if (date && !isNaN(date)) {
            // Conversão manual de data para o número de série do Excel
            // Excel conta dias a partir de 1º de janeiro de 1900.
            // A época do Excel é 30 de dezembro de 1899 para que 1900-01-01 seja o dia 1.
            const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
            const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
            const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
            ws[cellAddress].v = excelDate; // Atribui o número de série
            ws[cellAddress].t = 'n'; // Tipo número
            ws[cellAddress].s.numFmt = 'DD/MM/YYYY'; // Formato de exibição
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "center" };
          } else {
            ws[cellAddress].v = cellValue || '';
            ws[cellAddress].t = 's';
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
          }
        }
        // Estilos e valores específicos para 'CNPJ / CPF'
        else if (header === 'CNPJ / CPF') {
          ws[cellAddress].v = String(cellValue || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Força como texto para evitar problemas de formatação numérica
          ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
        }
        // Estilos e valores padrão para outras colunas
        else {
          ws[cellAddress].v = cellValue || '';
          ws[cellAddress].t = typeof cellValue === 'number' ? 'n' : 's';
          // Alinhamento padrão para texto: esquerda, para números: direita
          ws[cellAddress].s.alignment = {
            ...ws[cellAddress].s.alignment,
            horizontal: typeof cellValue === 'number' ? "right" : "left"
          };
        }
      }
    }

    // Adiciona autofiltro
    // Memória: "User wants exported Excel sheets to include a freeze pane for headers, autofilters, and consistent column widths."
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    // Memória: "User wants exported Excel sheets to include a freeze pane for headers, autofilters, and consistent column widths."
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cria o workbook e adiciona a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // Define a cor da aba "Pendentes"
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Sheets = wb.Workbook.Sheets || [];
    if (wb.Workbook.Sheets[0]) {
      wb.Workbook.Sheets[0].TabColor = { rgb: "4472C4" }; // Azul escuro
    } else {
      // Fallback caso a estrutura não exista, adiciona um novo objeto de sheet
      wb.Workbook.Sheets.push({ name: "Pendentes", TabColor: { rgb: "4472C4" } });
    }


    // Gera o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);

  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, getJustificativaCellText, parseDateForComparison, todayFormatted]);


  // Funções para lidar com os filtros de coluna
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prevColumn => (prevColumn === column ? null : column));
  }, []);

  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [column]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [column]: [...currentOptions, option] };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: [] // Limpa as opções selecionadas para a coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown
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
  }, [filterDropdownRef]); // toggleFilterDropdown não é necessário aqui, pois setActiveFilterColumn é o que realmente muda o estado.

  // Efeito para carregar os dados iniciais ou redefinir quando o arquivo muda
  useEffect(() => {
    if (data.length > 0) {
      // Se já há dados, recalcula as opções de filtro
      const newFilterOptions = {};
      tableHeaders.forEach(header => {
        if (header !== 'Justificativa do Abono' && header !== 'CNPJ / CPF') {
          const uniqueOptions = [...new Set(data.map(row => row[header]))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
          newFilterOptions[header] = uniqueOptions;
        }
      });
      setFilterOptions(newFilterOptions);
    }
  }, [data, tableHeaders]); // Dependências: data e tableHeaders

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Pendências</h1>
        <div className="controls-container">
          <div className="file-upload-section">
            <input type="file" accept=".csv" onChange={handleFileChange} className="file-input" id="file-upload" />
            <label htmlFor="file-upload" className="upload-button">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="action-button upload-action-button">
              {loading ? 'Carregando...' : 'Carregar Dados'}
            </button>
          </div>

          <div className="table-actions">
            {/* Memória: "User wants a search input (magnifying glass) to filter table rows instead of using browser Ctrl+F" */}
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} disabled={filteredAndSortedData.length === 0} className="action-button export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
          </div>
        </div>
        {error && <p className="error-message">Erro: {error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}> {/* CORREÇÃO AQUI */}
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
