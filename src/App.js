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
  }, []); // parseDateForComparison não tem dependências externas que mudam

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
  }, [today]); // Removido parseDateForComparison, pois é estável

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [today]); // Removido parseDateForComparison, pois é estável

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return normalizedJustificativa === '' || normalizedJustificativa === 'falta abonar';
  }, [normalizeForComparison]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  const getJustificativaCellStyle = useCallback((row) => {
    if (isOverdue(row) && isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
        textAlign: 'center'
      };
    }
    return {};
  }, [isOverdue, isAbonarCondition]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    if (isOverdue(row) && isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue, isAbonarCondition]);

  // Lida com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Lida com o upload do arquivo
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve corresponder ao esperado pelo backend (ex: 'file' ou 'csvFile')

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `Erro no servidor: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage += ` - ${errorData.message || JSON.stringify(errorData)}`;
        } catch (jsonError) {
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 200)}...`; // Limita o tamanho do texto do erro
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const processedData = result.data.map(row => {
        // Garante que 'Cliente' seja populado corretamente
        if (!row['Cliente'] && row['Contratante']) {
          row['Cliente'] = row['Contratante'];
        }
        return row;
      });

      setData(processedData);

      // Extrai cabeçalhos dinamicamente e os ordena de acordo com defaultTableHeaders
      const dynamicHeaders = processedData.length > 0 ? Object.keys(processedData[0]) : [];
      const finalHeaders = defaultTableHeaders.filter(header => dynamicHeaders.includes(header));
      setTableHeaders(finalHeaders);

      // Preenche as opções de filtro
      const newFilterOptions = {};
      finalHeaders.forEach(header => {
        if (header !== 'Data Limite' && header !== 'CNPJ / CPF') { // Não filtra por data ou CNPJ/CPF
          const uniqueValues = [...new Set(processedData.map(row => String(row[header] || '').trim()))]
            .filter(Boolean) // Remove valores vazios
            .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
          newFilterOptions[header] = uniqueValues;
        }
      });
      setFilterOptions(newFilterOptions);

      // Resetar filtros e ordenação ao carregar novo arquivo
      setSelectedFilterOptions({
        'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
      });
      setSearchTerm('');
      setSortColumn('Data Limite');
      setSortDirection('asc');

    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison]);

  // Lida com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Lida com a pesquisa global
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Lida com a mudança de opção de filtro
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

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
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
  }, []);

  // Filtra e ordena os dados da tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    filteredData = filteredData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se não há opções selecionadas para este filtro, não filtra
        }
        const rowValue = String(row[header] || '').trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Calcula o contador de pendências atrasadas
    let overdueCount = 0;
    filteredData.forEach(row => {
      if (isOverdue(row) && isAbonarCondition(row)) {
        overdueCount++;
      }
    });
    setCurrentOverdueCount(overdueCount);

    // Ordena os dados
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        const resultComparison = dateA.getTime() - dateB.getTime();
        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      } else if (sortColumn === 'CNPJ / CPF') {
        const numA = parseFloat(String(aValue).replace(/[^0-9.]/g, ''));
        const numB = parseFloat(String(bValue).replace(/[^0-9.]/g, ''));

        if (isNaN(numA) && isNaN(numB)) return 0;
        if (isNaN(numA)) return sortDirection === 'asc' ? 1 : -1;
        if (isNaN(numB)) return sortDirection === 'asc' ? -1 : 1;

        const resultComparison = numA - numB;
        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      } else {
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);

        const resultComparison = normalizedA.localeCompare(normalizedB);
        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      }
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, isAbonarCondition, tableHeaders]); // Adicionado isAbonarCondition

  // Retorna a classe CSS para a linha com base no status de atraso
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Função para exportar os dados filtrados para Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as pendências de hoje (atrasadas ou vencendo hoje)
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas ou vencendo hoje para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Primeira linha são os cabeçalhos
    filteredForExport.forEach(row => {
      ws_data.push(tableHeaders.map(header => {
        if (header === 'Data Limite') {
          // Converte a data para o formato de exibição para o Excel
          return formatDataLimite(row[header]);
        }
        if (header === 'Justificativa do Abono' && isOverdue(row) && isAbonarCondition(row)) {
          return 'FALTA ABONAR';
        }
        return String(row[header] || '').replace(/['"=]/g, '').trim();
      }));
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // --- Definição de Estilos ---
    const headerStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { rgb: 'FF4472C4' } }, // Azul escuro
      alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } },
      },
    };

    const defaultRowStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: 'FF000000' } }, // Preto
      fill: { fgColor: { rgb: 'FFFFFFFF' } }, // Branco
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { rgb: 'FFD3D3D3' } }, // Cinza claro
        bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
      },
    };

    const overdueRowStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { rgb: 'FFDC3545' } }, // Vermelho intenso
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } },
      },
    };

    const dueTodayRowStyle = {
      font: { name: 'Calibri', sz: 11, color: { rgb: 'FF000000' } }, // Preto
      fill: { fgColor: { rgb: 'FFFFFFC1' } }, // Amarelo claro
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } },
      },
    };

    const abonarCellStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { rgb: 'FF800080' } }, // Roxo intenso
      alignment: { vertical: 'center', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } },
      },
    };

    // --- Aplicação de Estilos ---
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Largura das colunas
    const colWidths = tableHeaders.map((header, colIndex) => {
      let maxWidth = String(header).length; // Largura mínima baseada no cabeçalho
      filteredForExport.forEach(row => {
        const cellValue = String(row[header] || '');
        if (cellValue.length > maxWidth) {
          maxWidth = cellValue.length;
        }
      });
      return { wch: maxWidth + 2 }; // Adiciona um pequeno padding
    });
    ws['!cols'] = colWidths;

    // Estilo do cabeçalho
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: tableHeaders[C] };
      ws[cellAddress].s = headerStyle;
    }

    // Estilos para as linhas de dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const originalRowIndex = R - 1; // Ajusta para o índice do array filteredForExport
      const rowData = filteredForExport[originalRowIndex];

      let currentRowBaseStyle = defaultRowStyle;
      if (isOverdue(rowData)) {
        currentRowBaseStyle = overdueRowStyle;
      } else if (isDueToday(rowData)) {
        currentRowBaseStyle = dueTodayRowStyle;
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const header = tableHeaders[C];
        const cellValue = rowData[header];

        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Garante que a célula exista

        // Aplica o estilo base da linha
        ws[cellAddress].s = { ...currentRowBaseStyle };

        // --- Estilos e Formatos Específicos por Coluna ---
        if (header === 'Justificativa do Abono' && isOverdue(rowData) && isAbonarCondition(rowData)) {
          Object.assign(ws[cellAddress].s, abonarCellStyle); // Mescla o estilo roxo
          ws[cellAddress].v = 'FALTA ABONAR'; // Garante o texto
          ws[cellAddress].t = 's'; // Tipo texto
        } else if (header === 'Data Limite') {
          const dateObj = parseDateForComparison(cellValue);
          if (dateObj) {
            ws[cellAddress].v = XLSX.utils.date_to_num(dateObj); // Converte para número de série do Excel
            ws[cellAddress].t = 'n'; // Tipo numérico
            ws[cellAddress].s.numFmt = 'DD/MM/YYYY'; // Formato de data
            Object.assign(ws[cellAddress].s.alignment, { horizontal: 'center' }); // Centraliza a data
          } else {
            ws[cellAddress].v = String(cellValue || '');
            ws[cellAddress].t = 's';
            Object.assign(ws[cellAddress].s.alignment, { horizontal: 'center' });
          }
        } else if (header === 'CNPJ / CPF') {
          ws[cellAddress].v = String(cellValue || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Garante que seja texto para preservar zeros à esquerda
          ws[cellAddress].s.numFmt = '@'; // Formato de texto
          Object.assign(ws[cellAddress].s.alignment, { horizontal: 'center' }); // Centraliza
        } else {
          ws[cellAddress].v = String(cellValue || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Tipo texto padrão
        }
      }
    }

    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, todayFormatted, isOverdue, isAbonarCondition, isDueToday, parseDateForComparison, formatDataLimite]);

  // Efeito para carregar dados iniciais ou reprocessar se o arquivo mudar
  useEffect(() => {
    if (file) {
      handleUpload();
    }
  }, [file, handleUpload]); // Dependência file para re-upload automático

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>Painel de Pendências</h1>
          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="action-button upload-button">
                <FontAwesomeIcon icon={faUpload} /> Carregar CSV
              </label>
              <button onClick={handleUpload} className="action-button process-button" disabled={!file || loading}>
                {loading ? 'Processando...' : 'Processar Arquivo'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar em todas as colunas..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <button onClick={exportToExcel} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <p className="error-message">Erro: {error}</p>}

      {data.length > 0 && (
        <div className="table-summary-container"> {/* Novo container para cards e tabela */}
          <div className="summary-cards">
            <div className="card">
              <h3>Total de Pendências</h3>
              <p>{data.length}</p>
            </div>
            <div className="card overdue-card">
              <h3>Pendências Atrasadas</h3>
              <p>{currentOverdueCount}</p>
            </div>
            {/* Você pode adicionar mais cards aqui, se desejar */}
          </div>

          <div className="table-wrapper">
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
          </div> {/* Fim do table-wrapper */}
        </div>
      )}
    </div>
  );
}

export default App;
