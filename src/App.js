// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  const tableHeaders = useMemo(() => [
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

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status);
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status;
  }, [normalizeForComparison]);

  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const parts = dateString.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
        if (parts) {
          const d = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T00:00:00`);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
        }
        return dateString;
      }
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
      return dateString;
    }
  }, []);

  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    const dataLimite = new Date(dataLimiteStr);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    dataLimite.setHours(0, 0, 0, 0);

    if (dataLimite < hoje) {
      if (!justificativa || justificativa.trim() === '') {
        return 'overdue-row-strong';
      } else {
        return 'overdue-row';
      }
    } else if (dataLimite.getTime() === hoje.getTime()) {
      return 'due-today-row';
    }
    return '';
  }, []);

  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    } else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'Status') {
      content = normalizeStatusValue(content);
    } else if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (dataLimiteStr) {
        const dataLimite = new Date(dataLimiteStr);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        dataLimite.setHours(0, 0, 0, 0);

        if (dataLimite < hoje && (!justificativa || justificativa.trim() === '')) {
          content = 'FALTA ABONAR';
          className = 'falta-abonar';
        }
      }
    }

    if (content === null || content === undefined || String(content).trim() === '') {
      className += ' empty-cell';
    }

    return { content, className };
  }, [formatCnpjCpf, formatDataLimite, normalizeStatusValue]);

  useEffect(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (!dataLimiteStr) return false;

      const dataLimite = new Date(dataLimiteStr);
      dataLimite.setHours(0, 0, 0, 0);

      return dataLimite < hoje && (!justificativa || justificativa.trim() === '');
    }).length;
    setOverdueCount(count);
  }, [filteredData]);

  const fetchData = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setOverdueCount(0);
    setSelectedFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const rawData = response.data;

      // Filtra os dados para incluir apenas os status permitidos
      const processedAndFilteredData = rawData.filter(row => {
        const status = normalizeStatusValue(row['Status']);
        return allowedStatuses.includes(status);
      });

      setData(processedAndFilteredData);
      setFilteredData(processedAndFilteredData); // Inicializa filteredData com os dados processados
      setActiveFilters({}); // Limpa filtros ativos
      setFilterSelections({}); // Limpa seleções de filtro
      setSortConfig({ key: 'Data Limite', direction: 'ascending' }); // Aplica ordenação padrão
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
      setSelectedFileName('');
    } finally {
      setLoading(false);
    }
  }, [allowedStatuses, normalizeStatusValue]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      fetchData(file);
    }
  };

  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[columnName];
      if (columnName === 'Status') {
        value = normalizeStatusValue(value);
      } else if (columnName === 'Data Limite') {
        value = formatDataLimite(value);
      } else if (columnName === 'CNPJ / CPF') {
        value = formatCnpjCpf(value);
      }
      values.add(value);
    });
    return Array.from(values).sort((a, b) => {
      if (a === null || a === undefined || a === '') return 1;
      if (b === null || b === undefined || b === '') return -1;
      return String(a).localeCompare(String(b));
    });
  }, [data, normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  const toggleFilterDropdown = useCallback((header, event) => {
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      const iconRect = event.currentTarget.getBoundingClientRect();
      // Posiciona o dropdown acima da tabela, alinhado com o ícone
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
      // Inicializa as seleções de filtro com base nos filtros ativos ou todos marcados
      const currentActiveFilters = activeFilters[header] || {};
      const initialSelections = {};
      getUniqueColumnValues(header).forEach(value => {
        initialSelections[value] = Object.keys(currentActiveFilters).length === 0 ? true : !!currentActiveFilters[value];
      });
      setFilterSelections(initialSelections);
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const toggleSelectAll = useCallback((header, selectAll) => {
    const newSelections = {};
    getUniqueColumnValues(header).forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setFilterSelections({});
    setOpenDropdown(null);
  }, []);

  useEffect(() => {
    const applyAllFilters = () => {
      let currentFilteredData = [...data];

      Object.keys(activeFilters).forEach(columnName => {
        const selectedValues = Object.keys(activeFilters[columnName]).filter(key => activeFilters[columnName][key]);
        if (selectedValues.length > 0) {
          currentFilteredData = currentFilteredData.filter(row => {
            let rowValue = row[columnName];
            if (columnName === 'Status') {
              rowValue = normalizeStatusValue(rowValue);
            } else if (columnName === 'Data Limite') {
              rowValue = formatDataLimite(rowValue);
            } else if (columnName === 'CNPJ / CPF') {
              rowValue = formatCnpjCpf(rowValue);
            }
            return selectedValues.includes(rowValue);
          });
        }
      });

      // Aplica a ordenação
      if (sortConfig.key) {
        currentFilteredData.sort((a, b) => {
          const aValue = a[sortConfig.key];
          const bValue = b[sortConfig.key];

          // Lógica de ordenação para Data Limite
          if (sortConfig.key === 'Data Limite') {
            const dateA = new Date(aValue);
            const dateB = new Date(bValue);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
              // Se as datas forem inválidas, tenta comparar como string
              return String(aValue).localeCompare(String(bValue));
            }
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }

          // Ordenação padrão para outros tipos de dados
          if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
          }
          if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        });
      }

      setFilteredData(currentFilteredData);
    };

    applyAllFilters();
  }, [data, activeFilters, sortConfig, normalizeStatusValue, formatDataLimite, formatCnpjCpf]);

  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? <FontAwesomeIcon icon={faSortUp} /> : <FontAwesomeIcon icon={faSortDown} />;
  }, [sortConfig]);

  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const ws_data = [
      tableHeaders.map(header => ({ v: header, t: 's', s: { font: { bold: true } } })), // Cabeçalhos em negrito
      ...filteredData.map(row =>
        tableHeaders.map(header => {
          const { content, className } = getCellContentAndClassName(row, header); // content é usado aqui
          let cellStyle = {};

          // Aplica estilos de cor de fundo da linha
          const rowClass = getRowClassByDataLimite(row);
          if (rowClass.includes('overdue-row-strong')) {
            cellStyle.fill = { fgColor: { rgb: "FFCCCC" } }; // Vermelho forte
          } else if (rowClass.includes('overdue-row')) {
            cellStyle.fill = { fgColor: { rgb: "FFDDDD" } }; // Vermelho normal
          } else if (rowClass.includes('due-today-row')) {
            cellStyle.fill = { fgColor: { rgb: "FFFFCC" } }; // Amarelo
          }

          // Estilo para "FALTA ABONAR" (roxo)
          if (className.includes('falta-abonar')) {
            cellStyle.fill = { fgColor: { rgb: "E0BBE4" } }; // Roxo
            cellStyle.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
          }

          return {
            v: content,
            t: typeof content === 'number' ? 'n' : 's', // Tipo numérico ou string
            s: cellStyle
          };
        })
      )
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => ({ wch: header.length + 5 })); // Largura baseada no cabeçalho
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'dados_tabela.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);


  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
          !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> Escolher Arquivo CSV
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
          {selectedFileName && <span className="file-name-display">Arquivo: {selectedFileName}</span>}
        </div>

        <div className="info-actions-container">
          <div className="overdue-count">
            OSs em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
          </button>
        </div>
      </div>

      {loading && <p className="loading-message">Carregando dados...</p>}
      {error && <p className="error-message">{error}</p>}

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} onClick={() => requestSort(header)}>
                    <div className="header-content">
                      {header}
                      <span className="sort-icon">{getSortIcon(header)}</span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${Object.keys(activeFilters[header] || {}).length > 0 ? 'active' : ''}`}
                        onClick={(e) => toggleFilterDropdown(header, e)}
                        ref={el => filterIconRefs.current[header] = el}
                      />
                    </div>

                    {openDropdown === header && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {getUniqueColumnValues(header).map(value => (
                            <label key={value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={filterSelections[value] || false}
                                onChange={() => handleFilterSelectionChange(value)}
                              />
                              {value === '' ? '(Vazio)' : value}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => toggleSelectAll(header, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header, false)}>Desmarcar Tudo</button>
                          <button onClick={() => applyFilters(header)}>Aplicar</button>
                          <button onClick={() => clearFilters(header)}>Limpar</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
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
