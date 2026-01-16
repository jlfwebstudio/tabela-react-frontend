// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style'; // Importação para estilos no Excel
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
    return status; // Retorna o status original se não houver correspondência
  }, [normalizeForComparison]);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta parsear no formato DD/MM/YYYY HH:MM:SS
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
      if (parts) {
        // Date constructor expects YYYY-MM-DD or MM/DD/YYYY
        const date = new Date(`${parts[2]}/${parts[1]}/${parts[3]} ${parts[4]}:${parts[5]}:${parts[6]}`);
        if (!isNaN(date.getTime())) {
          return `${parts[1]}/${parts[2]}/${parts[3]}`; // Retorna DD/MM/YYYY
        }
      }
      // Fallback para outros formatos se necessário, ou retorna o original
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna o original se não conseguir formatar
  }, []);

  const parseDataLimiteForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      // Tenta parsear no formato DD/MM/YYYY HH:MM:SS
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
      if (parts) {
        // Date constructor expects YYYY-MM-DD or MM/DD/YYYY
        const date = new Date(`${parts[2]}/${parts[1]}/${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}`);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      // Fallback para outros formatos
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      console.error("Erro ao parsear data para comparação:", dateString, e);
    }
    return null;
  }, []);

  const formatCnpjCpf = useCallback((cnpjCpf) => {
    if (typeof cnpjCpf !== 'string') return cnpjCpf;
    // Remove "="" e aspas extras
    let cleaned = cnpjCpf.replace(/^="|"$/g, '');
    // Remove todos os caracteres não numéricos
    cleaned = cleaned.replace(/\D/g, '');

    if (cleaned.length === 11) { // CPF
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleaned.length === 14) { // CNPJ
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cleaned; // Retorna o limpo se não for CPF nem CNPJ
  }, []);

  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const dataLimite = parseDataLimiteForComparison(dataLimiteStr);

    if (!dataLimite) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const limiteDateOnly = new Date(dataLimite);
    limiteDateOnly.setHours(0, 0, 0, 0);

    if (limiteDateOnly < today) {
      // Atrasado
      if (!justificativa || justificativa.trim() === '') {
        return 'overdue-strong'; // Vermelho forte se atrasado e sem justificativa
      } else {
        return 'overdue-normal'; // Vermelho mais claro se atrasado e com justificativa
      }
    } else if (limiteDateOnly.getTime() === today.getTime()) {
      return 'due-today'; // Amarelo se vence hoje
    }
    return '';
  }, [parseDataLimiteForComparison]);

  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Lógica para "FALTA ABONAR"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = parseDataLimiteForComparison(dataLimiteStr);
      const justificativa = row['Justificativa do Abono'];

      if (dataLimite) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limiteDateOnly = new Date(dataLimite);
        limiteDateOnly.setHours(0, 0, 0, 0);

        if (limiteDateOnly < today && (!justificativa || justificativa.trim() === '')) {
          content = 'FALTA ABONAR';
          className = 'falta-abonar';
        }
      }
    }

    // Adiciona classes de largura de coluna para CSS
    className += ` col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    return { content, className };
  }, [formatDataLimite, formatCnpjCpf, parseDataLimiteForComparison]);

  useEffect(() => {
    setFilteredData(data);
    setActiveFilters({});
    setFilterSelections({});
    setOpenDropdown(null);
  }, [data]);

  useEffect(() => {
    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];
      const dataLimite = parseDataLimiteForComparison(dataLimiteStr);

      if (!dataLimite) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const limiteDateOnly = new Date(dataLimite);
      limiteDateOnly.setHours(0, 0, 0, 0);

      return limiteDateOnly < today && (!justificativa || justificativa.trim() === '');
    }).length;
    setOverdueCount(count);
  }, [filteredData, parseDataLimiteForComparison]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
    } catch (err) {
      console.error("Erro no upload:", err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      }
    } finally {
      setLoading(false);
      event.target.value = null; // Limpa o input para permitir upload do mesmo arquivo novamente
    }
  };

  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[header];
      if (header === 'Data Limite') {
        value = formatDataLimite(value);
      } else if (header === 'CNPJ / CPF') {
        value = formatCnpjCpf(value);
      }
      if (value === null || value === undefined || value === '') {
        values.add(''); // Representa valores vazios
      } else {
        values.add(String(value));
      }
    });

    // Para o cabeçalho 'Status', filtra apenas os valores permitidos
    if (header === 'Status') {
      return Array.from(values).filter(v => allowedStatuses.includes(normalizeStatusValue(v))).sort();
    }

    return Array.from(values).sort((a, b) => {
      if (header === 'Data Limite') {
        const dateA = parseDataLimiteForComparison(a);
        const dateB = parseDataLimiteForComparison(b);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        if (dateA) return -1;
        if (dateB) return 1;
        return 0;
      }
      return String(a).localeCompare(String(b));
    });
  }, [data, formatDataLimite, formatCnpjCpf, allowedStatuses, normalizeStatusValue, parseDataLimiteForComparison]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const toggleSelectAll = useCallback((header, select) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = select;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const applyFilters = useCallback((header) => {
    const selectedValues = Object.keys(filterSelections).filter(key => filterSelections[key]);
    setActiveFilters(prev => ({
      ...prev,
      [header]: selectedValues.reduce((acc, val) => ({ ...acc, [val]: true }), {})
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setFilterSelections({});
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setOpenDropdown(null);
  }, []);

  const toggleFilterDropdown = useCallback((header, event) => {
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Calcula a posição do dropdown
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
    }
  }, [openDropdown]);

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

  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplica filtros
    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          let rowValue = row[header];
          if (header === 'Data Limite') {
            rowValue = formatDataLimite(rowValue);
          } else if (header === 'CNPJ / CPF') {
            rowValue = formatCnpjCpf(rowValue);
          }
          return selectedValues.includes(String(rowValue === null || rowValue === undefined || rowValue === '' ? '' : rowValue));
        });
      }
    });

    // Aplica ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.key === 'Data Limite') {
          const dateA = parseDataLimiteForComparison(aValue);
          const dateB = parseDataLimiteForComparison(bValue);
          if (dateA && dateB) {
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          if (dateA) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        // Ordenação para outros tipos (string, number)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, formatDataLimite, formatCnpjCpf, parseDataLimiteForComparison]);

  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // --- FUNÇÃO exportToExcel ATUALIZADA ---
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Filtrar apenas as pendências do dia (atrasadas ou vencendo hoje)
    const pendingData = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = parseDataLimiteForComparison(dataLimiteStr);

      if (!dataLimite) return false;

      const limiteDateOnly = new Date(dataLimite);
      limiteDateOnly.setHours(0, 0, 0, 0);

      return limiteDateOnly <= today; // Atrasado ou vencendo hoje
    });

    if (pendingData.length === 0) {
      alert("Não há pendências do dia (atrasadas ou vencendo hoje) para exportar.");
      return;
    }

    // 2. Preparar os dados para o Excel
    const ws_data = [tableHeaders.map(header => ({ v: header, t: 's', s: { font: { bold: true } } }))]; // Cabeçalhos em negrito

    pendingData.forEach(row => {
      const rowData = tableHeaders.map(header => {
        const { content, className } = getCellContentAndClassName(row, header);
        let cellStyle = {};

        // Estilo para a célula "FALTA ABONAR"
        if (className.includes('falta-abonar')) {
          cellStyle = {
            fill: { fgColor: { rgb: "800080" } }, // Roxo
            font: { color: { rgb: "FFFFFF" }, bold: true },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        return { v: content, t: 's', s: cellStyle };
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // 3. Aplicar estilos de linha (cores de fundo)
    for (let R = 1; R < ws_data.length; ++R) { // Começa de 1 para pular o cabeçalho
      const row = pendingData[R - 1]; // Pega o objeto da linha original
      const rowClass = getRowClassByDataLimite(row); // Obtém a classe de cor da linha

      let fillColor = null;
      if (rowClass.includes('overdue-strong')) {
        fillColor = "FF0000"; // Vermelho forte
      } else if (rowClass.includes('overdue-normal')) {
        fillColor = "FFCCCC"; // Vermelho mais claro
      } else if (rowClass.includes('due-today')) {
        fillColor = "FFFF00"; // Amarelo
      }

      if (fillColor) {
        for (let C = 0; C < tableHeaders.length; ++C) {
          const cellref = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellref]) ws[cellref] = { t: 's', v: '' }; // Garante que a célula exista
          if (!ws[cellref].s) ws[cellref].s = {};
          // Não sobrescreve o estilo da célula "FALTA ABONAR" se já tiver sido aplicado
          if (!ws[cellref].s.fill || ws[cellref].s.fill.fgColor.rgb !== "800080") {
             ws[cellref].s.fill = { fgColor: { rgb: fillColor } };
          }
          // Ajusta a cor da fonte para branco em fundos escuros
          if (fillColor === "FF0000" && (!ws[cellref].s.font || ws[cellref].s.font.color.rgb !== "FFFFFF")) {
            ws[cellref].s.font = { color: { rgb: "FFFFFF" } };
          }
        }
      }
    }

    // Estilo para cabeçalhos (já aplicado acima, mas reforçando)
    const headerStyle = {
      font: { bold: true, color: { rgb: "333333" } },
      fill: { fgColor: { rgb: "F2F2F2" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cellref = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellref]) ws[cellref] = { t: 's', v: tableHeaders[C] };
      ws[cellref].s = headerStyle;
    }

    // Set column widths (approximate)
    const wscols = [
      { wch: 12 }, // Chamado
      { wch: 15 }, // Numero Referencia
      { wch: 25 }, // Contratante
      { wch: 20 }, // Serviço
      { wch: 15 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 30 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 15 }, // Cidade
      { wch: 20 }, // Técnico
      { wch: 25 }, // Prestador
      { wch: 30 }, // Justificativa do Abono
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias do Dia');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'pendencias_do_dia.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite, parseDataLimiteForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-buttons">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> {selectedFileName ? selectedFileName : 'Carregar CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {data.length > 0 && (
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
            </button>
          )}
          {overdueCount > 0 && (
            <div className="overdue-count">
              OSs em Atraso (Não Abonadas): {overdueCount}
            </div>
          )}
        </div>
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container">
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
