// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
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
  const [sortConfig, setSortConfig] = useState({ key: 'DATA LIMITE', direction: 'ascending' }); // Ajustado para cabeçalho normalizado
  const [selectedFileName, setSelectedFileName] = useState('');

  // NOVO: Mapeamento dos cabeçalhos para exibição e para acesso aos dados
  const displayHeaders = useMemo(() => [
    { key: 'CHAMADO', display: 'Chamado' },
    { key: 'NUMERO REFERENCIA', display: 'Numero Referencia' },
    { key: 'CONTRATANTE', display: 'Contratante' },
    { key: 'SERVICO', display: 'Serviço' },
    { key: 'STATUS', display: 'Status' },
    { key: 'DATA LIMITE', display: 'Data Limite' },
    { key: 'CLIENTE', display: 'Cliente' },
    { key: 'CNPJ / CPF', display: 'CNPJ / CPF' },
    { key: 'CIDADE', display: 'Cidade' },
    { key: 'TECNICO', display: 'Técnico' },
    { key: 'PRESTADOR', display: 'Prestador' },
    { key: 'JUSTIFICATIVA DO ABONO', display: 'Justificativa do Abono' },
  ], []);

  // Usar apenas as chaves para a lógica interna
  const tableHeaders = useMemo(() => displayHeaders.map(h => h.key), [displayHeaders]);

  // Lista de status permitidos (normalizados para comparação)
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERENCIA', // Normalizado
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TECNICO' // Normalizado
  ].map(s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()), []);


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
      const dataLimiteStr = row['DATA LIMITE']; // Usar cabeçalho normalizado
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
      const status = normalizeForComparison(row['STATUS'] || ''); // Usar cabeçalho normalizado
      return allowedStatuses.includes(status);
    });

    // 2. Aplicar filtros de coluna
    Object.keys(activeFilters).forEach(headerKey => { // headerKey é o nome normalizado
      const selectedValues = Object.keys(activeFilters[headerKey]).filter(key => activeFilters[headerKey][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = String(row[headerKey] || '').trim();
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

  const getUniqueColumnValues = useCallback((headerKey) => { // headerKey é o nome normalizado
    const values = new Set();
    data.forEach(row => {
      const value = String(row[headerKey] || '').trim();
      // Filtrar valores de status para mostrar apenas os permitidos no dropdown
      if (headerKey === 'STATUS') { // Usar cabeçalho normalizado
        const normalizedStatus = normalizeForComparison(value);
        if (!allowedStatuses.includes(normalizedStatus)) {
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

  const toggleFilterDropdown = useCallback((headerKey, event) => { // headerKey é o nome normalizado
    event.stopPropagation();
    if (openDropdown === headerKey) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(headerKey);
      const iconRect = filterIconRefs.current[headerKey].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5,
        left: iconRect.left + window.scrollX,
      });
      const currentSelections = activeFilters[headerKey] || {};
      const uniqueValues = getUniqueColumnValues(headerKey);
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

  const applyFilters = useCallback((headerKey) => { // headerKey é o nome normalizado
    const selected = Object.keys(filterSelections).filter(key => filterSelections[key]);
    setActiveFilters(prev => ({
      ...prev,
      [headerKey]: selected.reduce((acc, val) => ({ ...acc, [val]: true }), {})
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((headerKey) => { // headerKey é o nome normalizado
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[headerKey];
      return newFilters;
    });
    setFilterSelections({});
    setOpenDropdown(null);
  }, []);

  const toggleSelectAll = useCallback((headerKey, selectAll) => { // headerKey é o nome normalizado
    const uniqueValues = getUniqueColumnValues(headerKey);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const requestSort = useCallback((key) => { // key é o nome normalizado
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

        if (sortConfig.key === 'DATA LIMITE') { // Usar cabeçalho normalizado
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
    const dataLimiteStr = row['DATA LIMITE']; // Usar cabeçalho normalizado
    const justificativaAbono = String(row['JUSTIFICATIVA DO ABONO'] || '').trim(); // Usar cabeçalho normalizado

    if (!dataLimiteStr) return '';

    const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!parts) return '';

    const [, day, month, year] = parts;
    const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dataLimite.setHours(0, 0, 0, 0);

    // Lógica para "FALTA ABONAR" na linha: roxo se atrasada E justificativa vazia
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
  const getCellContentAndClassName = useCallback((row, headerKey) => { // headerKey é o nome normalizado
    let content = row[headerKey];
    let className = '';

    if (headerKey === 'CNPJ / CPF') { // Usar cabeçalho normalizado
      content = formatCnpjCpf(content);
      className = 'col-cnpj-cpf';
    } else if (headerKey === 'DATA LIMITE') { // Usar cabeçalho normalizado
      content = formatDataLimite(content);
    } else if (headerKey === 'STATUS') { // Usar cabeçalho normalizado
      // Normaliza o status para exibição, garantindo que seja um dos 5 permitidos
      const normalizedStatus = normalizeForComparison(content || '');
      // Encontra o status original na lista de permitidos para exibição, ou usa o original se não encontrar
      content = allowedStatuses.find(s => normalizeForComparison(s) === normalizedStatus) || content;
    }

    // Lógica para "FALTA ABONAR" na célula
    if (headerKey === 'JUSTIFICATIVA DO ABONO') { // Usar cabeçalho normalizado
      const dataLimiteStr = row['DATA LIMITE']; // Usar cabeçalho normalizado
      const justificativaAbono = String(row['JUSTIFICATIVA DO ABONO'] || '').trim(); // Usar cabeçalho normalizado

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

    // Adiciona classes de largura de coluna (usando os nomes de cabeçalho normalizados)
    if (headerKey === 'NUMERO REFERENCIA') className += ' col-numero-referencia';
    else if (headerKey === 'CIDADE') className += ' col-cidade';
    else if (headerKey === 'SERVICO') className += ' col-servico';
    else if (headerKey === 'TECNICO') className += ' col-tecnico';
    else if (headerKey === 'JUSTIFICATIVA DO ABONO') className += ' col-justificativa';

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

    // Aplica estilo ao cabeçalho (usando displayHeaders para os nomes de exibição)
    XLSX.utils.sheet_add_aoa(ws, [displayHeaders.map(h => ({ v: h.display, t: 's', s: headerStyle }))], { origin: "A1" });

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

      displayHeaders.forEach((header, colIndex) => { // Iterar sobre displayHeaders para obter a chave e o conteúdo
        const { content, className } = getCellContentAndClassName(row, header.key); // Passar a chave normalizada
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

    const colWidths = displayHeaders.map(header => ({ // Usar displayHeaders para largura
      wch: Math.max(
        header.display.length, // Usar o nome de exibição para calcular largura
        ...dataToExport.map(row => String(row[header.key] || '').length) // Usar a chave para acessar o dado
      ) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, filename);
  }, [displayHeaders, getRowClassByDataLimite, getCellContentAndClassName]);

  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['DATA LIMITE']; // Usar cabeçalho normalizado
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
                {displayHeaders.map((header) => ( // Iterar sobre displayHeaders para exibição
                  <th key={header.key}>
                    <div className="header-content">
                      <span className="sortable-header" onClick={() => requestSort(header.key)}> {/* Usar header.key para ordenação */}
                        {header.display} {/* Usar header.display para o texto visível */}
                        {sortConfig.key === header.key && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header.key] && Object.values(activeFilters[header.key]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header.key, event)}
                        ref={el => filterIconRefs.current[header.key] = el}
                      />
                    </div>

                    {openDropdown === header.key && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {getUniqueColumnValues(header.key).map(value => ( // Usar header.key para valores
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
                          <button onClick={() => toggleSelectAll(header.key, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header.key, false)}>Desmarcar Tudo</button>
                          <button onClick={() => applyFilters(header.key)}>Aplicar</button>
                          <button onClick={() => clearFilters(header.key)}>Limpar</button>
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
                  {displayHeaders.map((header) => { // Iterar sobre displayHeaders
                    const { content, className } = getCellContentAndClassName(row, header.key); // Passar header.key
                    return (
                      <td key={header.key} className={className}>
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
