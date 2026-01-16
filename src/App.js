// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload, faSearch } from '@fortawesome/free-solid-svg-icons';
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
  const [searchTerm, setSearchTerm] = useState('');

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

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString;
  }, []);

  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  }, []);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);
          return dataLimite < today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para contador:", dataLimiteStr, e);
      }
      return false;
    }).length;
    setOverdueCount(count);
  }, [filteredData]);

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
  }, []);

  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      const value = row[header] !== undefined && row[header] !== null ? String(row[header]).trim() : '';
      values.add(value);
    });
    return Array.from(values).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
  }, [data]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newActiveFilters = { ...prev };
      delete newActiveFilters[header];
      return newActiveFilters;
    });
    setFilterSelections({});
    setOpenDropdown(null);
  }, []);

  const toggleSelectAll = useCallback((header, select) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = select;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const toggleFilterDropdown = useCallback((header, event) => {
    event.stopPropagation();
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5,
        left: iconRect.left + window.scrollX
      });
      const currentSelections = activeFilters[header] || {};
      setFilterSelections(currentSelections);
    }
  }, [openDropdown, activeFilters]);

  // Efeito para aplicar filtros de coluna e pesquisa global
  useEffect(() => {
    let currentFilteredData = data;

    // Aplica filtros de coluna
    currentFilteredData = currentFilteredData.filter(row => {
      return tableHeaders.every(header => {
        const activeHeaderFilters = activeFilters[header];
        if (!activeHeaderFilters || Object.keys(activeHeaderFilters).length === 0 || !Object.values(activeHeaderFilters).some(Boolean)) {
          return true; // Nenhum filtro ativo para esta coluna
        }
        const cellValue = row[header] !== undefined && row[header] !== null ? String(row[header]).trim() : '';
        return activeHeaderFilters[cellValue];
      });
    });

    // Aplica pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentFilteredData = currentFilteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, searchTerm, tableHeaders, normalizeForComparison]);

  // Lógica de ordenação (agora como um useMemo para sortedData)
  const sortedData = useMemo(() => {
    if (!sortConfig.key || filteredData.length === 0) {
      return filteredData;
    }

    const sortableItems = [...filteredData];
    sortableItems.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      // Lógica de ordenação para Data Limite
      if (sortConfig.key === 'Data Limite') {
        const parseDate = (dateString) => {
          const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            return new Date(`${month}/${day}/${year}`);
          }
          return new Date(0); // Retorna uma data inválida para valores não parseáveis
        };
        const dateA = parseDate(aValue);
        const dateB = parseDate(bValue);

        if (dateA < dateB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (dateA > dateB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      }

      // Lógica de ordenação padrão para outros tipos (string, number)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [filteredData, sortConfig]); // Depende de filteredData e sortConfig

  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa dados anteriores
    setFilteredData([]); // Limpa dados filtrados anteriores
    setActiveFilters({}); // Limpa filtros ativos
    setFilterSelections({}); // Limpa seleções de filtro
    setSearchTerm(''); // Limpa termo de pesquisa

    const formData = new FormData();
    formData.append('file', file); // Nome do campo deve ser 'file' para Multer

    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // Aumenta o timeout para 120 segundos (2 minutos)
      });
      setData(response.data);
      // O useEffect de filtragem será acionado automaticamente com os novos dados
    } catch (err) {
      console.error('Erro no upload:', err);
      if (err.response) {
        setError(`Erro ao carregar o arquivo: ${err.response.data.error || err.response.statusText}.`);
      } else if (err.request) {
        setError('Erro de rede ou o servidor não respondeu. Tente novamente.');
      } else {
        setError('Erro ao processar o arquivo. Verifique o formato ou tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    try {
      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return '';

      const [, day, month, year] = parts;
      const dataLimite = new Date(`${month}/${day}/${year}`);
      dataLimite.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dataLimite < today) {
        // Todas as linhas atrasadas são vermelho forte
        return 'overdue-strong';
      } else if (dataLimite.getTime() === today.getTime()) {
        return 'due-today';
      }
    } catch (e) {
      console.error("Erro ao determinar classe da linha:", dataLimiteStr, e);
    }
    return '';
  }, []);

  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Formatação específica para CNPJ / CPF
    if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }
    // Formatação específica para Data Limite
    else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    }

    // Aplica classe para "FALTA ABONAR"
    if (header === 'Justificativa do Abono' && normalizeForComparison(content) === 'FALTA ABONAR') {
      className = 'falta-abonar';
    }

    return { content, className };
  }, [formatCnpjCpf, formatDataLimite, normalizeForComparison]);

  const exportDataToExcel = useCallback((dataToExport, filename) => {
    if (dataToExport.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet([]); // Cria uma planilha vazia

    // Adiciona cabeçalhos com estilo
    const headerRow = tableHeaders.map(h => ({ v: h, t: 's', s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4472C4" } } } }));
    XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

    // Adiciona dados e aplica estilos de linha e célula
    XLSX.utils.sheet_add_json(ws, dataToExport, { origin: "A2", skipHeader: true });

    // Aplica estilos de linha e célula (cores)
    dataToExport.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 2; // +1 para cabeçalho, +1 para 0-index
      const rowClass = getRowClassByDataLimite(row);
      let fillColor = null;
      let fontColor = null;

      if (rowClass === 'overdue-strong') {
        fillColor = "FF0000"; // Vermelho forte
        fontColor = "FFFFFF"; // Branco
      } else if (rowClass === 'due-today') {
        fillColor = "FFFF00"; // Amarelo
        fontColor = "000000"; // Preto
      } else if (rowIndex % 2 === 0) { // Linhas pares (fundo cinza claro)
        fillColor = "F0F0F0";
        fontColor = "000000";
      } else { // Linhas ímpares (fundo branco)
        fillColor = "FFFFFF";
        fontColor = "000000";
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex - 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }; // Garante que a célula exista

        const { content, className } = getCellContentAndClassName(row, header);

        // Aplica estilo de preenchimento da linha
        if (!ws[cellRef].s) ws[cellRef].s = {};
        ws[cellRef].s.fill = { fgColor: { rgb: fillColor } };
        ws[cellRef].s.font = { color: { rgb: fontColor } };

        // Sobrescreve estilo da célula "FALTA ABONAR" se aplicável
        if (className === 'falta-abonar') {
          ws[cellRef].s.fill = { fgColor: { rgb: "800080" } }; // Roxo
          ws[cellRef].s.font = { bold: true, color: { rgb: "FFFFFF" } }; // Branco e negrito
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, filename);
  }, [tableHeaders, getRowClassByDataLimite, getCellContentAndClassName]);

  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);
          return dataLimite <= today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para exportação de pendências:", dataLimiteStr, e);
      }
      return false;
    });

    if (pendingData.length === 0) {
      alert('Nenhum registro de pendência do dia encontrado para exportar.');
      return;
    }

    exportDataToExcel(pendingData, 'pendencias_do_dia.xlsx');
  }, [filteredData, exportDataToExcel]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName ? selectedFileName : 'Carregar CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {data.length > 0 && (
            <>
              <button onClick={() => exportDataToExcel(filteredData, 'tabela_completa.xlsx')} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
              </button>
              <button onClick={handleExportPendingToExcel} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
              </button>
            </>
          )}
          {overdueCount > 0 && (
            <div className="overdue-count">
              OSs em Atraso: {overdueCount}
            </div>
          )}
        </div>

        {/* NOVO CAMPO DE PESQUISA GLOBAL */}
        {data.length > 0 && (
          <div className="search-bar-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar em toda a tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="global-search-input"
            />
          </div>
        )}
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container" translate="no">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span className="sortable-header" onClick={() => requestSort(header)}>
                        {header}
                        {sortConfig.key === header && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
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
              {sortedData.map((row, rowIndex) => (
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
