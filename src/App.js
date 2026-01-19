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
  }, []); // parseDateForComparison não tem dependências que mudam

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
  }, [parseDateForComparison, today]); // <-- CORREÇÃO AQUI: Adicionado parseDateForComparison

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]); // <-- CORREÇÃO AQUI: Adicionado parseDateForComparison

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

  // Função para determinar a classe da linha com base no status da OS
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Lida com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Lida com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders([]);
    setFilterOptions({});
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
    setSearchTerm('');
    setSortColumn('Data Limite');
    setSortDirection('asc');

    const formData = new FormData();
    formData.append('file', file); // Nome do campo 'file' para o backend

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

      if (result.data && result.data.length > 0) {
        // Mapeia os dados para a ordem e nomes de cabeçalho desejados
        const processedData = result.data.map(row => {
          const newRow = {};
          defaultTableHeaders.forEach(header => {
            // Mapeamento específico para "Cliente" e "Contratante"
            if (header === 'Cliente') {
              newRow[header] = row['Nome Cliente'] || '';
            } else if (header === 'Contratante') {
              newRow[header] = row['Contratante'] === 'MOB' ? 'MOB' : (row['Contratante'] || '');
            } else if (header === 'Justificativa do Abono') {
              newRow[header] = row['Justificativa do Abono'] || '';
            }
            else {
              newRow[header] = row[header] || '';
            }
          });
          return newRow;
        });

        setData(processedData);
        setTableHeaders(defaultTableHeaders); // Usa os cabeçalhos padrão definidos

        // Coleta opções de filtro
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          if (header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Justificativa do Abono') { // Não cria filtro para Data Limite, CNPJ/CPF e Justificativa
            const options = [...new Set(processedData.map(item => String(item[header]).trim()))].filter(Boolean).sort();
            newFilterOptions[header] = options;
          }
        });
        setFilterOptions(newFilterOptions);

      } else {
        setError('Nenhum dado encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison]);


  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Lida com a mudança no termo de pesquisa
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Lida com a mudança de seleção de uma opção de filtro
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

  // Aplica os filtros da coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => {
      const newFilters = { ...prev };
      delete newFilters[column]; // Remove o filtro para a coluna
      return newFilters;
    });
    setActiveFilterColumn(null); // Fecha o dropdown
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
    let currentData = data;

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(String(row[header])).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    currentData = currentData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra
        const cellValue = normalizeForComparison(String(row[column]));
        return selectedOptions.some(option => normalizeForComparison(option) === cellValue);
      });
    });

    // Ordena os dados
    const sortedData = [...currentData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        const resultComparison = dateA.getTime() - dateB.getTime();
        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      }

      // Lógica de ordenação para outros tipos (string, number)
      const valA = normalizeForComparison(String(aValue));
      const valB = normalizeForComparison(String(bValue));

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Atualiza o contador de pendências atrasadas
    const overdueCount = sortedData.filter(row => isOverdue(row)).length;
    setCurrentOverdueCount(overdueCount);

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, tableHeaders]);


  // Filtra apenas as pendências de hoje para exportação
  const filteredForExport = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));
  }, [filteredAndSortedData, isOverdue, isDueToday]);


  // Função para exportar os dados para Excel
  const exportToExcel = useCallback(() => {
    if (filteredForExport.length === 0) {
      alert('Não há dados para exportar (apenas pendências atrasadas ou de hoje).');
      return;
    }

    const ws_data = [
      defaultTableHeaders, // Cabeçalhos
      ...filteredForExport.map(row => defaultTableHeaders.map(header => {
        // Formata o valor para a célula, mas a formatação de data/CNPJ/CPF será feita no estilo
        if (header === 'Justificativa do Abono') {
          return getJustificativaCellText(row);
        }
        return String(row[header] || '');
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // --- Definição de Estilos ---
    const baseBorder = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4472C4' } }, // Azul escuro
      alignment: { horizontal: 'center', vertical: 'center' },
      border: baseBorder
    };

    const defaultRowStyle = {
      font: { color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFFFFF' } }, // Branco
      alignment: { horizontal: 'left', vertical: 'center' },
      border: baseBorder
    };

    const overdueRowStyle = {
      font: { color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFC7CE' } }, // Vermelho claro
      alignment: { horizontal: 'left', vertical: 'center' },
      border: baseBorder
    };

    const dueTodayRowStyle = {
      font: { color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFFFCC' } }, // Amarelo claro
      alignment: { horizontal: 'left', vertical: 'center' },
      border: baseBorder
    };

    const abonarCellStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      alignment: { horizontal: 'center', vertical: 'center' },
      border: baseBorder
    };

    // --- Aplicação de Estilos e Larguras de Coluna ---
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];

    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 0;
      const header = defaultTableHeaders[C];
      maxWidth = Math.max(maxWidth, String(header).length); // Largura mínima do cabeçalho

      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress] || {}; // Garante que a célula exista
        ws[cellAddress] = cell; // Atribui de volta para garantir que o objeto de célula esteja no ws

        let currentCellStyle = {};

        if (R === 0) { // Cabeçalho
          Object.assign(currentCellStyle, headerStyle);
          cell.v = header; // Garante que o valor do cabeçalho esteja na célula
          cell.t = 's'; // Tipo string para cabeçalho
        } else { // Linhas de dados
          const originalRowData = filteredForExport[R - 1]; // -1 porque a linha 0 é o cabeçalho
          if (isOverdue(originalRowData)) {
            Object.assign(currentCellStyle, overdueRowStyle);
          } else if (isDueToday(originalRowData)) {
            Object.assign(currentCellStyle, dueTodayRowStyle);
          } else {
            Object.assign(currentCellStyle, defaultRowStyle);
          }

          // Estilos específicos para a coluna 'Justificativa do Abono'
          if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            Object.assign(currentCellStyle, abonarCellStyle);
            cell.v = 'FALTA ABONAR'; // Garante o texto correto na célula
            cell.t = 's'; // Tipo string
          } else if (header === 'Justificativa do Abono') {
            cell.v = String(originalRowData[header] || '');
            cell.t = 's';
          }
          // Formatação específica para 'Data Limite'
          else if (header === 'Data Limite') {
            const dateValue = parseDateForComparison(originalRowData[header]);
            if (dateValue) {
              cell.v = XLSX.utils.date_to_num(dateValue); // Converte para número de série do Excel
              cell.t = 'n'; // Tipo numérico
              currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
              currentCellStyle.alignment = { horizontal: 'center', vertical: 'center' };
            } else {
              cell.v = String(originalRowData[header] || '');
              cell.t = 's';
            }
          }
          // Formatação específica para 'CNPJ / CPF'
          else if (header === 'CNPJ / CPF') {
            cell.v = String(originalRowData[header] || '').replace(/['"=]/g, '').trim();
            cell.t = 's'; // Tipo string para preservar zeros à esquerda
            currentCellStyle.numFmt = '@'; // Formato de texto
            currentCellStyle.alignment = { horizontal: 'center', vertical: 'center' };
          }
          // Outras colunas
          else {
            cell.v = String(originalRowData[header] || '');
            cell.t = 's'; // Tipo string padrão
          }
        }

        // Aplica o estilo à célula
        cell.s = currentCellStyle;

        // Calcula a largura máxima da coluna
        const cellText = String(cell.v || '');
        maxWidth = Math.max(maxWidth, cellText.length);
      }
      colWidths[C] = { wch: maxWidth + 2 }; // Adiciona um pequeno padding
    }
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Pendencias_${todayFormatted}.xlsx`);
  }, [filteredForExport, defaultTableHeaders, todayFormatted, isOverdue, isDueToday, isAbonarCondition, parseDateForComparison, getJustificativaCellText]);


  useEffect(() => {
    if (data.length > 0) {
      // Recalcula as opções de filtro sempre que os dados mudam
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        if (header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Justificativa do Abono') {
          const options = [...new Set(data.map(item => String(item[header]).trim()))].filter(Boolean).sort();
          newFilterOptions[header] = options;
        }
      });
      setFilterOptions(newFilterOptions);
    }
  }, [data, defaultTableHeaders]);


  return (
    <div className="App">
      <header className="app-header">
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
              <label htmlFor="csv-upload-input" className="button upload-button">
                <FontAwesomeIcon icon={faUpload} /> Carregar CSV
              </label>
              <button onClick={handleUpload} className="button process-button" disabled={!file || loading}>
                {loading ? 'Processando...' : 'Processar Arquivo'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <button onClick={exportToExcel} className="button export-button" disabled={data.length === 0}>
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {loading && data.length === 0 && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Carregando dados...</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="table-container">
          <div className="summary-cards">
            <div className="card total-card">
              <h3>Total de OSs: {data.length}</h3>
            </div>
            <div className="card filtered-card">
              <h3>OSs Filtradas: {filteredAndSortedData.length}</h3>
            </div>
            <div className="card overdue-card">
              <h3>Pendências Atrasadas: {currentOverdueCount}</h3>
            </div>
          </div>
          <div className="table-wrapper"> {/* Adicionado para rolagem horizontal e cabeçalho fixo */}
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
