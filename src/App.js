// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import *as XLSX from 'xlsx-js-style';
// eslint-disable-next-line no-unused-vars
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

  // Lista de status permitidos
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

      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return false;

      const [, day, month, year] = parts;
      const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
      dataLimite.setHours(0, 0, 0, 0);

      return dataLimite < today;
    }).length;

    setOverdueCount(count);
  }, [filteredData]);

  // Efeito para aplicar filtros de coluna e status permitidos
  useEffect(() => {
    let currentFilteredData = [...data];

    // 1. Filtrar por status permitidos (SEMPRE ATIVO)
    currentFilteredData = currentFilteredData.filter(row => {
      const status = normalizeForComparison(row['Status'] || '');
      return allowedStatuses.some(allowedStatus => normalizeForComparison(allowedStatus) === status);
    });

    // 2. Aplicar filtros de coluna
    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = String(row[header] || '').trim();
          const normalizedCellValue = normalizeForComparison(cellValue);
          return selectedValues.some(selectedValue => {
            const normalizedSelectedValue = normalizeForComparison(selectedValue);
            return normalizedCellValue === normalizedSelectedValue;
          });
        });
      }
    });

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, allowedStatuses, normalizeForComparison, tableHeaders]);


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setActiveFilters({});
    setFilterSelections({});
    setOpenDropdown(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      // setFilteredData será atualizado pelo useEffect de filtragem
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      const value = String(row[header] || '').trim();
      // Filtrar valores de status para mostrar apenas os permitidos no dropdown
      if (header === 'Status') {
        const normalizedStatus = normalizeForComparison(value);
        if (!allowedStatuses.some(allowedStatus => normalizeForComparison(allowedStatus) === normalizedStatus)) {
          return; // Ignora status não permitidos
        }
      }
      values.add(value);
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
    return sortedValues;
  }, [data, allowedStatuses, normalizeForComparison]);

  const toggleFilterDropdown = useCallback((header, event) => {
    event.stopPropagation();
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5,
        left: iconRect.left + window.scrollX,
      });
      const currentSelections = activeFilters[header] || {};
      const uniqueValues = getUniqueColumnValues(header);
      const newSelections = {};
      uniqueValues.forEach(value => {
        newSelections[value] = currentSelections[value] !== undefined ? currentSelections[value] : true;
      });
      setFilterSelections(newSelections);
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  const handleClickOutside = useCallback((event) => {
    if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
        !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
      setOpenDropdown(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((header) => {
    const selected = Object.keys(filterSelections).filter(key => filterSelections[key]);
    setActiveFilters(prev => ({
      ...prev,
      [header]: selected.reduce((acc, val) => ({ ...acc, [val]: true }), {})
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

  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const sortedData = useMemo(() => {
    if (!filteredData.length) return [];
    let sortableItems = [...filteredData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const aValue = String(a[sortConfig.key] || '').trim();
        const bValue = String(b[sortConfig.key] || '').trim();

        if (sortConfig.key === 'Data Limite') {
          const parseDate = (dateString) => {
            const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (parts) {
              return new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
            }
            return new Date(0);
          };
          const dateA = parseDate(aValue);
          const dateB = parseDate(bValue);

          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        } else if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        } else {
          return 0;
        }
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  // Função para determinar a classe da linha com base na Data Limite e Justificativa
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativaAbono = String(row['Justificativa do Abono'] || '').trim();

    if (!dataLimiteStr) return '';

    const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!parts) return '';

    const [, day, month, year] = parts;
    const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dataLimite.setHours(0, 0, 0, 0);

    // CORREÇÃO AQUI: Lógica para "FALTA ABONAR" na linha
    // A linha fica roxa se estiver atrasada E a justificativa estiver vazia
    if (dataLimite < today && justificativaAbono === '') {
      return 'falta-abonar';
    } else if (dataLimite < today) {
      return 'overdue-strong';
    } else if (dataLimite.getTime() === today.getTime()) {
      return 'due-today';
    }
    return '';
  }, []);


  // Função para obter o conteúdo e a classe da célula
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
      className = 'col-cnpj-cpf';
    } else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'Status') {
      // Normaliza o status para exibição, garantindo que seja um dos 5 permitidos
      const normalizedStatus = normalizeForComparison(content || '');
      content = allowedStatuses.find(s => normalizeForComparison(s) === normalizedStatus) || content;
    }

    // CORREÇÃO AQUI: Lógica para "FALTA ABONAR" na célula
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativaAbono = String(row['Justificativa do Abono'] || '').trim();

      const parts = dataLimiteStr ? dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/) : null;
      const dataLimite = parts ? new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dataLimite) dataLimite.setHours(0, 0, 0, 0);

      // Se a data estiver atrasada E a justificativa estiver vazia, exibe "FALTA ABONAR" e aplica a classe
      if (dataLimite && dataLimite < today && justificativaAbono === '') {
        content = 'FALTA ABONAR';
        className += ' falta-abonar-cell';
      }
    }

    // Adiciona classes de largura de coluna
    if (header === 'Numero Referencia') className += ' col-numero-referencia';
    else if (header === 'Cidade') className += ' col-cidade';
    else if (header === 'Serviço') className += ' col-servico';
    else if (header === 'Técnico') className += ' col-tecnico';
    else if (header === 'Justificativa do Abono') className += ' col-justificativa';

    // eslint-disable-next-line no-unused-vars
    return { content, className: className.trim() };
  }, [formatCnpjCpf, formatDataLimite, normalizeForComparison, allowedStatuses]);


  const exportDataToExcel = useCallback((dataToExport, filename) => {
    if (dataToExport.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet([]);

    const headerStyle = {
      fill: { fgColor: { rgb: "4472C4" } },
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };

    XLSX.utils.sheet_add_aoa(ws, [tableHeaders.map(h => ({ v: h, t: 's', s: headerStyle }))], { origin: "A1" });

    dataToExport.forEach((row, rowIndex) => {
      const excelRow = [];
      const rowClass = getRowClassByDataLimite(row);
      let fillColor = null;
      let fontColor = { rgb: "000000" };

      if (rowClass === 'overdue-strong') {
        fillColor = { rgb: "FF0000" };
        fontColor = { rgb: "FFFFFF" };
      } else if (rowClass === 'due-today') {
        fillColor = { rgb: "FFFF00" };
        fontColor = { rgb: "000000" };
      } else if (rowClass === 'falta-abonar') {
        fillColor = { rgb: "800080" };
        fontColor = { rgb: "FFFFFF" };
      } else if (rowIndex % 2 === 0) {
        fillColor = { rgb: "F0F0F0" };
      } else {
        fillColor = { rgb: "FFFFFF" };
      }

      tableHeaders.forEach((header, colIndex) => {
        const { content, className } = getCellContentAndClassName(row, header);
        let cellStyle = {
          fill: fillColor,
          font: fontColor,
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "thin", color: { rgb: "CCCCCC" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } },
          },
        };

        if (className.includes('falta-abonar-cell')) {
          cellStyle.fill = { fgColor: { rgb: "800080" } };
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } };
        }

        excelRow.push({ v: content, t: 's', s: cellStyle });
      });
      XLSX.utils.sheet_add_aoa(ws, [excelRow], { origin: -1 });
    });

    const colWidths = tableHeaders.map(header => ({
      wch: Math.max(
        header.length,
        ...dataToExport.map(row => String(row[header] || '').length)
      ) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, filename);
  }, [tableHeaders, getRowClassByDataLimite, getCellContentAndClassName]);

  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return false;

      const [, day, month, year] = parts;
      const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
      dataLimite.setHours(0, 0, 0, 0);

      return dataLimite <= today;
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
        <h1>Gerenciador de OS</h1>

        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName || 'Carregar Arquivo CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
        </div>

        {data.length > 0 && (
          <div className="action-buttons">
            <div className="overdue-count">
              OSs em Atraso: <span className="count-number">{overdueCount}</span>
            </div>
            <button onClick={() => exportDataToExcel(filteredData, 'tabela_completa.xlsx')} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
            </button>
            <button onClick={handleExportPendingToExcel} className="export-button export-pending">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
            </button>
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
