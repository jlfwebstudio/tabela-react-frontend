import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import './App.css';
import { FaFilter, FaSortUp, FaSortDown, FaSearch, FaUpload, FaFileExcel } from 'react-icons/fa'; // Removido faTimesCircle

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState(null);
  const [columnFilterOptions, setColumnFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const filterDropdownRef = useRef(null);
  const filterButtonRef = useRef(null);

  // CORREÇÃO ESLint: allowedStatuses é uma constante, memoizá-la com useMemo
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []); // Array de dependências vazio, pois é uma constante

  const tableHeaders = useMemo(() => [
    { key: 'Chamado', label: 'Chamado', sortable: true, filterable: true },
    { key: 'Numero Referencia', label: 'Número Referência', sortable: true, filterable: true },
    { key: 'Contratante', label: 'Contratante', sortable: true, filterable: true },
    { key: 'Serviço', label: 'Serviço', sortable: true, filterable: true },
    { key: 'Status', label: 'Status', sortable: true, filterable: true },
    { key: 'Data Limite', label: 'Data Limite', sortable: true, filterable: true },
    { key: 'Cliente', label: 'Cliente', sortable: true, filterable: true },
    { key: 'CNPJ / CPF', label: 'CNPJ / CPF', sortable: true, filterable: true },
    { key: 'Cidade', label: 'Cidade', sortable: true, filterable: true },
    { key: 'Técnico', label: 'Técnico', sortable: true, filterable: true },
    { key: 'Prestador', label: 'Prestador', sortable: true, filterable: true },
    { key: 'Justificativa do Abono', label: 'Justificativa do Abono', sortable: true, filterable: true },
  ], []);

  // Função utilitária para normalizar strings para comparação (case-insensitive, sem acentos)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  // CORREÇÃO ESLint: formatDataLimite é uma função utilitária, memoizá-la com useCallback
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Espera DD/MM/YYYY e formata para YYYY-MM-DD para o construtor Date
    const parts = dateString.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateString; // Retorna original se não estiver no formato esperado
  }, []);

  const isOverdue = useCallback((dateString) => {
    if (!dateString) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const dateParts = dateString.split('/');
    if (dateParts.length !== 3) return false; // Formato inválido

    // Cria a data no formato YYYY-MM-DD para evitar problemas de interpretação
    const targetDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
    targetDate.setHours(0, 0, 0, 0);

    return targetDate < today;
  }, []);

  const isDueToday = useCallback((dateString) => {
    if (!dateString) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateParts = dateString.split('/');
    if (dateParts.length !== 3) return false;

    const targetDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
    targetDate.setHours(0, 0, 0, 0);

    return targetDate.getTime() === today.getTime();
  }, []);

  const getRowClass = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);
    const isRowDueToday = isDueToday(dataLimite);
    const needsAbono = isRowOverdue && normalizeForComparison(justificativa) === 'falta abonar';

    if (needsAbono) {
      // Se precisa de abono, a linha inteira é vermelha intensa
      return 'row-overdue';
    } else if (isRowOverdue) {
      return 'row-overdue'; // Vermelho intenso para todas as atrasadas
    } else if (isRowDueToday) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return '';
  }, [isOverdue, isDueToday, normalizeForComparison]); // Dependências corretas

  const getCellClass = useCallback((row, columnKey) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);
    const needsAbono = isRowOverdue && normalizeForComparison(justificativa) === 'falta abonar';

    if (columnKey === 'Justificativa do Abono' && needsAbono) {
      return 'cell-falta-abonar'; // Roxo para a célula de justificativa
    }
    return '';
  }, [isOverdue, normalizeForComparison]);

  const formatCellValue = useCallback((value, columnKey, row) => {
    if (columnKey === 'Justificativa do Abono') {
      const dataLimite = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];
      const isRowOverdue = isOverdue(dataLimite);
      const needsAbono = isRowOverdue && normalizeForComparison(justificativa) === 'falta abonar';
      return needsAbono ? 'FALTA ABONAR' : value;
    }
    return value;
  }, [isOverdue, normalizeForComparison]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setError('');
    setData([]);
    setFilteredData([]);
    setSelectedFilterOptions({}); // Limpa filtros ao fazer novo upload

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      if (result && Array.isArray(result)) {
        // Aplica o filtro de status permitido imediatamente após o upload
        const initialFiltered = result.filter(row =>
          allowedStatuses.some(status => normalizeForComparison(row.Status) === normalizeForComparison(status))
        );
        setData(initialFiltered);
        setFilteredData(initialFiltered); // Inicializa filteredData com os dados filtrados por status
      } else {
        setError('Formato de dados inesperado do servidor.');
        setData([]);
        setFilteredData([]);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  // Efeito para recalcular opções de filtro e aplicar filtro de status
  useEffect(() => {
    const newColumnFilterOptions = {};
    tableHeaders.forEach(header => {
      if (header.filterable) {
        const options = new Set();
        data.forEach(row => {
          const value = row[header.key];
          if (value) {
            options.add(value);
          }
        });
        newColumnFilterOptions[header.key] = Array.from(options).sort((a, b) =>
          normalizeForComparison(a).localeCompare(normalizeForComparison(b))
        );
      }
    });
    setColumnFilterOptions(newColumnFilterOptions);

    // Aplica o filtro de status permitido sempre que os dados mudam
    const statusFiltered = data.filter(row =>
      allowedStatuses.some(status => normalizeForComparison(row.Status) === normalizeForComparison(status))
    );
    setFilteredData(statusFiltered);

  }, [data, tableHeaders, allowedStatuses, normalizeForComparison]); // Dependências corretas

  // Lógica de ordenação
  const handleSort = useCallback((columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  useEffect(() => {
    let currentSortedData = [...data];

    // Aplica o filtro de status permitido antes de qualquer outra filtragem/ordenação
    currentSortedData = currentSortedData.filter(row =>
      allowedStatuses.some(status => normalizeForComparison(row.Status) === normalizeForComparison(status))
    );

    // Aplica a pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentSortedData = currentSortedData.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica os filtros de coluna
    Object.keys(selectedFilterOptions).forEach(columnKey => {
      const selectedOptions = selectedFilterOptions[columnKey];
      if (selectedOptions && selectedOptions.length > 0) {
        currentSortedData = currentSortedData.filter(row =>
          selectedOptions.includes(row[columnKey])
        );
      }
    });

    // Aplica a ordenação
    if (sortColumn) {
      currentSortedData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica especial para Data Limite
        if (sortColumn === 'Data Limite') {
          const dateA = new Date(formatDataLimite(aValue));
          const dateB = new Date(formatDataLimite(bValue));
          if (isNaN(dateA) || isNaN(dateB)) return 0; // Trata datas inválidas
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }

        // Para outros tipos, tenta comparação numérica ou string
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para comparação de string case-insensitive e sem acentos
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);
        return sortDirection === 'asc'
          ? normalizedA.localeCompare(normalizedB)
          : normalizedB.localeCompare(normalizedA);
      });
    }

    setFilteredData(currentSortedData);
  }, [data, sortColumn, sortDirection, selectedFilterOptions, searchTerm, allowedStatuses, normalizeForComparison, formatDataLimite]); // Dependências corretas

  const handleFilterButtonClick = useCallback((columnKey, event) => {
    setFilterColumn(columnKey);
    setFilterDropdownOpen(true);
    // Posiciona o dropdown abaixo do botão de filtro
    const buttonRect = event.currentTarget.getBoundingClientRect();
    if (filterDropdownRef.current) {
      filterDropdownRef.current.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;
      filterDropdownRef.current.style.left = `${buttonRect.left + window.scrollX}px`;
    }
  }, []);

  const handleFilterOptionChange = useCallback((option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[filterColumn] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [filterColumn]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [filterColumn]: [...currentOptions, option]
        };
      }
    });
  }, [filterColumn]);

  const applyColumnFilters = useCallback(() => {
    setFilterDropdownOpen(false);
  }, []);

  const clearColumnFilter = useCallback(() => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [filterColumn]: []
    }));
    setFilterDropdownOpen(false);
  }, [filterColumn]);

  // CORREÇÃO ESLint: Removido clearAllFilters pois não é utilizada
  // const clearAllFilters = useCallback(() => {
  //   setSelectedFilterOptions({});
  //   setSearchTerm('');
  //   setSortColumn(null);
  //   setSortDirection('asc');
  // }, []);

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target)
      ) {
        setFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getOverdueCount = useCallback(() => {
    return filteredData.filter(row => {
      const dataLimite = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];
      const isRowOverdue = isOverdue(dataLimite);
      const needsAbono = isRowOverdue && normalizeForComparison(justificativa) === 'falta abonar';
      // Conta como atrasado se a linha está atrasada E precisa de abono, OU se está atrasada e não tem justificativa
      return isRowOverdue && (needsAbono || normalizeForComparison(justificativa) === '');
    }).length;
  }, [filteredData, isOverdue, normalizeForComparison]);

  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    // Filtra apenas os itens pendentes de hoje (atrasados e vencendo hoje)
    const pendingTodayData = filteredData.filter(row => {
      const dataLimite = row['Data Limite'];
      return isOverdue(dataLimite) || isDueToday(dataLimite);
    });

    if (pendingTodayData.length === 0) {
      alert('Nenhum item pendente para exportar hoje.');
      return;
    }

    const ws_data = [tableHeaders.map(h => h.label)]; // Cabeçalhos
    const ws_cols = tableHeaders.map(h => ({ wch: 20 })); // Largura padrão das colunas

    pendingTodayData.forEach(row => {
      const rowData = tableHeaders.map(header => {
        const value = formatCellValue(row[header.key], header.key, row);
        return { v: value, t: 's' }; // Define tipo como string
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica estilos de cor de fundo e cor da fonte
    pendingTodayData.forEach((row, rowIndex) => {
      const rowClass = getRowClass(row);
      const dataLimite = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];
      const isRowOverdue = isOverdue(dataLimite);
      const needsAbono = isRowOverdue && normalizeForComparison(justificativa) === 'falta abonar';

      // Estilo para a linha inteira (vermelho/amarelo)
      let rowBgColor = '';
      let rowTextColor = '';

      if (rowClass === 'row-overdue') {
        rowBgColor = '#C00000'; // Vermelho intenso
        rowTextColor = '#FFFFFF'; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = '#FFC000'; // Amarelo
        rowTextColor = '#000000'; // Preto
      }

      // Aplica o estilo de fundo e texto para cada célula da linha
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para cabeçalho
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }; // Garante que a célula existe

        // Estilo da célula de Justificativa do Abono se for "FALTA ABONAR"
        if (header.key === 'Justificativa do Abono' && needsAbono) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: '800080' } }, // Roxo intenso
            font: { color: { rgb: 'FFFFFF' } }, // Branco
            alignment: { vertical: 'center', horizontal: 'left' },
            border: {
              top: { style: 'thin', color: { auto: 1 } },
              bottom: { style: 'thin', color: { auto: 1 } },
              left: { style: 'thin', color: { auto: 1 } },
              right: { style: 'thin', color: { auto: 1 } },
            }
          };
        } else if (rowBgColor) {
          // Aplica o estilo da linha para as outras células
          ws[cellRef].s = {
            fill: { fgColor: { rgb: rowBgColor.substring(1) } }, // Remove '#'
            font: { color: { rgb: rowTextColor.substring(1) } }, // Remove '#'
            alignment: { vertical: 'center', horizontal: 'left' },
            border: {
              top: { style: 'thin', color: { auto: 1 } },
              bottom: { style: 'thin', color: { auto: 1 } },
              left: { style: 'thin', color: { auto: 1 } },
              right: { style: 'thin', color: { auto: 1 } },
            }
          };
        }
      });
    });

    ws['!cols'] = ws_cols; // Aplica larguras de coluna

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [tableHeaders, isOverdue, isDueToday, getRowClass, formatCellValue, normalizeForComparison, filteredData]); // Dependências corretas

  const overdueCount = getOverdueCount();

  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FaUpload className="icon-spacing" /> {fileName ? 'Trocar Arquivo CSV' : 'Upload Arquivo CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {fileName && <span className="file-name-display">{fileName}</span>}
        </div>
        <div className="action-buttons">
          <div className="search-container">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar na tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button onClick={exportToExcel} className="export-button">
            <FaFileExcel className="icon-spacing" /> Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            OSs Atrasadas: <span className="count-number">{overdueCount}</span>
          </div>
        </div>
      </header>

      <main className="data-table-container">
        {loading && <p>Carregando dados...</p>}
        {error && <p className="error-message">{error}</p>}
        {!loading && !error && filteredData.length === 0 && (
          <p>{data.length === 0 ? 'Faça o upload de um arquivo CSV para começar.' : 'Nenhum dado corresponde aos filtros aplicados.'}</p>
        )}

        {!loading && !error && filteredData.length > 0 && (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map(header => (
                    <th key={header.key} className={`col-${header.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span className="header-label">{header.label}</span>
                        <div className="header-actions">
                          {header.sortable && (
                            <span className="sort-icons" onClick={() => handleSort(header.key)}>
                              <FaSortUp className={sortColumn === header.key && sortDirection === 'asc' ? 'active' : ''} />
                              <FaSortDown className={sortColumn === header.key && sortDirection === 'desc' ? 'active' : ''} />
                            </span>
                          )}
                          {header.filterable && (
                            <span
                              className={`filter-icon ${filterColumn === header.key && filterDropdownOpen ? 'active' : ''}`}
                              onClick={(e) => handleFilterButtonClick(header.key, e)}
                              ref={filterColumn === header.key ? filterButtonRef : null}
                            >
                              <FaFilter />
                            </span>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {tableHeaders.map(header => (
                      <td
                        key={header.key}
                        className={`col-${header.key.toLowerCase().replace(/[^a-z0-9]/g, '-')} ${getCellClass(row, header.key)}`}
                      >
                        {formatCellValue(row[header.key], header.key, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filterDropdownOpen && filterColumn && (
          <div className="filter-dropdown" ref={filterDropdownRef}>
            <div className="filter-options-container">
              {columnFilterOptions[filterColumn] && columnFilterOptions[filterColumn].map(option => (
                <label key={option} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedFilterOptions[filterColumn]?.includes(option) || false}
                    onChange={() => handleFilterOptionChange(option)}
                  />
                  {option}
                </label>
              ))}
            </div>
            <div className="filter-actions">
              <button onClick={applyColumnFilters}>Aplicar</button>
              <button onClick={clearColumnFilter}>Limpar</button>
              {/* <button onClick={clearAllFilters}>Limpar Todos</button> Removido pois a função não é usada */}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
