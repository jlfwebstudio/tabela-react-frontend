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
  const [sortDirection, setSortDirection] = useState('desc'); // ALTERADO: Ordenar do mais atrasado para o com mais prazo
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
    // Remove a parte da hora se existir (ex: "29/09/2025 16:00:00" -> "29/09/2025")
    const dateOnlyString = dateString.split(' ')[0];
    const parts = dateOnlyString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }, []);

  // ALTERADO: Função para formatar a Data Limite para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Remove a parte da hora se existir
    return dateString.split(' ')[0];
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // CORRIGIDO: Lógica para determinar a classe CSS da linha (cor)
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);
    const isRowDueToday = isDueToday(row);

    // Se estiver atrasada E a justificativa for "FALTA ABONAR" (ou vazia), a linha é vermelha
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return 'row-overdue';
    }
    // Se estiver atrasada (e não for "FALTA ABONAR"), a linha é vermelha
    if (isRowOverdue) {
      return 'row-overdue';
    }
    // Se vence hoje, a linha é amarela
    if (isRowDueToday) {
      return 'row-due-today';
    }
    // Caso contrário, é azul padrão
    return 'row-default-blue';
  }, [isOverdue, isDueToday, normalizeForComparison]);

  // CORRIGIDO: Lógica para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);

    // Aplica roxo intenso se estiver atrasado E a justificativa for "FALTA ABONAR" (ou vazia)
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // CORRIGIDO: Lógica para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);

    // Exibe "FALTA ABONAR" se estiver atrasado E a justificativa for "FALTA ABONAR" (ou vazia)
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);

  const handleFileChange = useCallback((event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]);
    setTableHeaders(defaultTableHeaders);
    setSortColumn('Data Limite');
    setSortDirection('desc'); // ALTERADO: Ordenação inicial
    setSearchTerm('');
    setActiveFilterColumn(null);
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  }, [defaultTableHeaders]);

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders(defaultTableHeaders);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      if (result.length > 0) {
        const actualHeaders = Object.keys(result[0]);
        const orderedHeaders = defaultTableHeaders.filter(header => actualHeaders.includes(header));
        setTableHeaders(orderedHeaders);
        setData(result);
      } else {
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}. Verifique o console para mais detalhes.`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  useEffect(() => {
    if (data.length > 0 && tableHeaders.length > 0) {
      const newFilterOptions = {};
      tableHeaders.forEach(header => {
        const options = [...new Set(data.map(row => row[header]))].sort((a, b) => {
          if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
          }
          return 0;
        });
        newFilterOptions[header] = options;
      });
      setFilterOptions(newFilterOptions);
    } else {
      setFilterOptions({});
    }
  }, [data, tableHeaders]);

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const toggleFilterDropdown = useCallback((header) => {
    setActiveFilterColumn(prev => (prev === header ? null : header));
  }, []);

  const handleFilterOptionChange = useCallback((header, option, isChecked) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (isChecked) {
        return { ...prev, [header]: [...currentOptions, option] };
      } else {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null);
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
    setActiveFilterColumn(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon')) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let currentData = [...data];

    // 1. Aplica filtros de coluna (incluindo o filtro padrão de Status)
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.some(option => normalizeForComparison(row[header]) === normalizeForComparison(option))
        );
      }
    });

    // 2. Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 3. Aplica ordenação
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);
          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);


  const overdueCount = useMemo(() => {
    if (!filteredAndSortedData || filteredAndSortedData.length === 0) return 0;
    return filteredAndSortedData.filter(row => isOverdue(row)).length;
  }, [filteredAndSortedData, isOverdue]);

  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const todayFormatted = today.toLocaleDateString('pt-BR');

    const dataToExport = filteredAndSortedData.filter(row =>
      isOverdue(row) || isDueToday(row)
    ).map(row => {
      const newRow = { ...row };
      newRow['Data Limite'] = formatDataLimite(row['Data Limite']);
      if (isOverdue(row) && normalizeForComparison(row['Justificativa do Abono']) === 'falta abonar') {
        newRow['Justificativa do Abono'] = 'FALTA ABONAR';
      }
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Definir larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      else if (header === 'Justificativa do Abono') width = 35;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Numero Referencia') width = 20;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Cliente') width = 25;
      else if (header === 'Contratante') width = 25;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Prestador') width = 25;
      else if (header === 'Cidade') width = 20;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Estilos para células de dados
    const defaultBorderStyle = {
      top: { style: "thin", color: { rgb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
      left: { style: "thin", color: { rgb: "FFCCCCCC" } },
      right: { style: "thin", color: { rgb: "FFCCCCCC" } },
    };
    const defaultFontStyle = { color: { rgb: "FF000000" } }; // Texto preto padrão
    const defaultAlignment = { vertical: "center" };

    const overdueCellStyle = {
      fill: { fgColor: { rgb: "FFC00000" } }, // Vermelho intenso
      font: { ...defaultFontStyle, color: { rgb: "FFFFFFFF" } }, // Texto branco
      alignment: defaultAlignment,
      border: defaultBorderStyle
    };

    const dueTodayCellStyle = {
      fill: { fgColor: { rgb: "FFFFC000" } }, // Amarelo
      font: { ...defaultFontStyle, color: { rgb: "FF000000" } }, // Texto preto
      alignment: defaultAlignment,
      border: defaultBorderStyle
    };

    const defaultBlueCellStyle = {
      fill: { fgColor: { rgb: "FFE0F2F7" } }, // Azul claro suave
      font: { ...defaultFontStyle, color: { rgb: "FF000000" } }, // Texto preto
      alignment: defaultAlignment,
      border: defaultBorderStyle
    };

    const faltaAbonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { ...defaultFontStyle, color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: defaultAlignment,
      border: defaultBorderStyle
    };

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos às células de dados
    for (let R = 0; R < dataToExport.length; ++R) {
      const originalRow = dataToExport[R];
      const excelRowIndex = R + 1; // +1 para pular o cabeçalho

      const isRowOverdue = isOverdue(originalRow);
      const isRowDueToday = isDueToday(originalRow);
      const justificativaText = originalRow['Justificativa do Abono'];

      for (let C = 0; C < tableHeaders.length; ++C) {
        const header = tableHeaders[C];
        const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex, c: C });
        if (!ws[cellRef]) ws[cellRef] = { v: originalRow[header] };

        let cellStyle = { ...defaultBlueCellStyle };

        if (header === 'Justificativa do Abono' && justificativaText === 'FALTA ABONAR') {
          cellStyle = { ...faltaAbonarCellStyle };
        } else if (isRowOverdue) {
          cellStyle = { ...overdueCellStyle };
        } else if (isRowDueToday) {
          cellStyle = { ...dueTodayCellStyle };
        } else {
          cellStyle = { ...defaultBlueCellStyle };
        }

        // Formatação específica para CNPJ / CPF como texto
        if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's';
          ws[cellRef].v = String(originalRow[header]);
        } else if (header === 'Data Limite') {
          ws[cellRef].t = 's'; // Mantém como string para DD/MM/YYYY
        } else {
          ws[cellRef].t = 's'; // Default para string
        }

        ws[cellRef].s = cellStyle;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
    XLSX.writeFile(wb, `Pendencias_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite, normalizeForComparison, today]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Selecionar CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>

          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <span onClick={() => handleSort(header)} className="sortable-header">
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
                      </span>
                      <div className="filter-container" ref={filterDropdownRef}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header || (selectedFilterOptions[header] && selectedFilterOptions[header].length > 0) ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedFilterOptions[header]?.includes(option) || false}
                                    onChange={(e) => handleFilterOptionChange(header, option, e.target.checked)}
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
                          ? formatDataLimite(row['Data Limite']) // Passa a string original para formatDataLimite
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
