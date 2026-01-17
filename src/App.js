import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver'; // Mantido para compatibilidade, embora XLSX.writeFile seja usado
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // eslint-disable-next-line react-hooks/exhaustive-deps, no-unused-vars
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
  }, []);

  const normalizeForComparison = useCallback((text) => {
    if (typeof text !== 'string') return text;
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não for uma data válida
  }, [parseDateForComparison]);

  const isOverdue = useCallback((dateString) => {
    const limitDate = parseDateForComparison(dateString);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return limitDate < today;
  }, [parseDateForComparison]);

  const isDueToday = useCallback((dateString) => {
    const limitDate = parseDateForComparison(dateString);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return limitDate.getTime() === today.getTime();
  }, [parseDateForComparison]);

  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';
    const isRowOverdue = isOverdue(row['Data Limite']);
    const isRowDueToday = isDueToday(row['Data Limite']);

    if (isRowOverdue) {
      return 'row-overdue';
    } else if (isRowDueToday) {
      return 'row-due-today';
    } else {
      return 'row-default-blue';
    }
  }, [isOverdue, isDueToday, normalizeForComparison]);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row['Data Limite']);

    if (isRowOverdue && justificativa === 'falta abonar') {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row['Data Limite']);

    if (isRowOverdue && justificativa === 'falta abonar') {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores
    setTableHeaders([]); // Limpa os cabeçalhos anteriores

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        setTableHeaders(Object.keys(result[0]));
      } else {
        setData([]);
        setTableHeaders([]);
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Falha ao processar o arquivo: ${err.message}. Verifique o formato do CSV e a conexão com o backend.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  const toggleFilterDropdown = useCallback((header) => {
    setActiveFilterColumn(activeFilterColumn === header ? null : header);
  }, [activeFilterColumn]);

  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [header]: [...currentOptions, option]
        };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: [] // Limpa as opções selecionadas para aquela coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // eslint-disable-next-line no-unused-vars
  const getColumnFilterOptions = useCallback((header) => {
    if (!data || data.length === 0) return [];
    const options = new Set(data.map(row => row[header]));
    return Array.from(options).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
  }, [data, normalizeForComparison]);

  const filterOptions = useMemo(() => {
    const options = {};
    tableHeaders.forEach(header => {
      if (data && data.length > 0) {
        const uniqueOptions = new Set(data.map(row => row[header]));
        options[header] = Array.from(uniqueOptions).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
      } else {
        options[header] = [];
      }
    });
    return options;
  }, [data, tableHeaders, normalizeForComparison]);


  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let currentData = [...data];
    const normalizedSearchTerm = normalizeForComparison(searchTerm); // eslint-disable-line no-unused-vars

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
    if (normalizedSearchTerm) {
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

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);
          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0;
        }

        // Tratamento para CNPJ / CPF como texto
        if (sortColumn === 'CNPJ / CPF') {
          const numA = String(aValue).replace(/\D/g, '');
          const numB = String(bValue).replace(/\D/g, '');
          return sortDirection === 'asc' ? numA.localeCompare(numB) : numB.localeCompare(numA);
        }

        // Ordenação padrão para outros campos
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue)) : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdueCount = useMemo(() => {
    if (!filteredAndSortedData || filteredAndSortedData.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return filteredAndSortedData.filter(row => {
      const limitDate = parseDateForComparison(row['Data Limite']);
      return limitDate && (limitDate < today || limitDate.getTime() === today.getTime());
    }).length;
  }, [filteredAndSortedData, parseDateForComparison]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    if (!filteredAndSortedData || filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredAndSortedData.filter(row => {
      const limitDate = parseDateForComparison(row['Data Limite']);
      return limitDate && (limitDate < today || limitDate.getTime() === today.getTime());
    }).map(row => {
      // Mapeia os dados para o formato de exportação, aplicando a lógica de "FALTA ABONAR"
      const newRow = { ...row };
      if (isOverdue(row['Data Limite']) && normalizeForComparison(row['Justificativa do Abono']) === 'falta abonar') {
        newRow['Justificativa do Abono'] = 'FALTA ABONAR';
      }
      // Formata a Data Limite para DD/MM/YYYY para o Excel
      newRow['Data Limite'] = formatDataLimite(row['Data Limite']);
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // --- APLICAÇÃO DE ESTILOS ---

    // Estilos para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Estilos para as células de dados
    const overdueStyle = {
      font: { color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FFC00000" } }, // Vermelho intenso
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const dueTodayStyle = {
      font: { color: { rgb: "FF000000" } }, // Preto
      fill: { fgColor: { rgb: "FFFFC000" } }, // Amarelo
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const defaultBlueStyle = {
      font: { color: { rgb: "FF000000" } }, // Preto
      fill: { fgColor: { rgb: "FFE0F2F7" } }, // Azul claro
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const faltaAbonarStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplica estilos aos cabeçalhos
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = headerStyle;
    }

    // Aplica estilos às células de dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const rowData = dataToExport[R - 1]; // Ajusta o índice para os dados
      const isRowOverdue = isOverdue(rowData['Data Limite']);
      const isRowDueToday = isDueToday(rowData['Data Limite']);
      const justificativa = normalizeForComparison(rowData['Justificativa do Abono']);

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;

        let cellStyle = defaultBlueStyle; // Estilo padrão para a linha

        if (isRowOverdue) {
          cellStyle = overdueStyle;
        } else if (isRowDueToday) {
          cellStyle = dueTodayStyle;
        }

        // Aplica o estilo da célula "FALTA ABONAR" se for o caso, prevalecendo
        const header = tableHeaders[C]; // Obtém o cabeçalho da coluna
        if (header === 'Justificativa do Abono' && isRowOverdue && justificativa === 'falta abonar') {
          cellStyle = faltaAbonarStyle;
        }

        ws[cellAddress].s = cellStyle;

        // Tratamento especial para CNPJ / CPF como texto
        if (header === 'CNPJ / CPF') {
          ws[cellAddress].t = 's'; // Define o tipo da célula como string
          ws[cellAddress].v = String(rowData[header]); // Garante que o valor seja string
        }
        // Tratamento especial para Data Limite como data formatada
        if (header === 'Data Limite') {
          // O valor já foi formatado para DD/MM/YYYY no dataToExport
          ws[cellAddress].t = 's'; // Define como string para manter o formato DD/MM/YYYY
        }
      }
    }

    // Ajusta larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      if (header === 'Justificativa do Abono') width = 35;
      if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      if (header === 'CNPJ / CPF') width = 20;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, 'Pendencias_Hoje.xlsx');
  }, [filteredAndSortedData, isOverdue, isDueToday, normalizeForComparison, formatDataLimite, tableHeaders]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              Escolher Arquivo CSV
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {loading && <p>Processando...</p>}
            {error && <p className="error-message">{error}</p>}
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
              {searchTerm && (
                <FontAwesomeIcon
                  icon={faTimesCircle}
                  className="clear-search-icon"
                  onClick={() => setSearchTerm('')}
                />
              )}
            </div>
            <button onClick={exportToExcel} className="export-button">
              Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
          </div>
        </div>
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text-sort">
                        <span onClick={() => handleSort(header)} className="sortable-header">
                          {header}
                        </span>
                        <div className="sort-icons">
                          <FontAwesomeIcon
                            icon={faSortUp}
                            className={`sort-icon ${sortColumn === header && sortDirection === 'asc' ? 'active' : ''}`}
                          />
                          <FontAwesomeIcon
                            icon={faSortDown}
                            className={`sort-icon ${sortColumn === header && sortDirection === 'desc' ? 'active' : ''}`}
                          />
                        </div>
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header || (selectedFilterOptions[header] && selectedFilterOptions[header].length > 0) ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedFilterOptions[header]?.includes(option) || false}
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
