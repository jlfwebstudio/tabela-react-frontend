// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({});
  const filterDropdownRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const tableHeaders = useMemo(() => [
    'Chamado', 'Numero Referencia', 'Contratante', 'Serviço', 'Status',
    'Data Limite', 'Cliente', 'CNPJ / CPF', 'Cidade', 'Técnico',
    'Prestador', 'Justificativa do Abono',
  ], []);

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO',
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    return dateString;
  }, []);

  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  }, []);

  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]);
      setSortColumn('Data Limite');
      setSortDirection('asc');
      setSearchTerm('');
      setOpenFilterDropdown(null);
      setSelectedFilterOptions({});
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para enviar.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      // CORREÇÃO: Verifica se a resposta é OK antes de tentar parsear como JSON
      if (!response.ok) {
        const errorText = await response.text(); // Tenta ler como texto para ver o HTML de erro
        console.error('Erro na resposta do backend:', errorText);
        setError(`Erro no servidor: ${response.status}. Verifique o console para detalhes. Possível problema no backend ou URL.`);
        setData([]);
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await response.text();
        console.error('Resposta não é JSON:', errorText);
        setError('Erro: O servidor não retornou JSON. Verifique o backend. (Resposta: ' + errorText.substring(0, 100) + '...)');
        setData([]);
        return;
      }

      const result = await response.json();

      if (!Array.isArray(result) || result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos após o processamento.');
        setData([]);
      } else {
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(row.Status || '') === normalizeForComparison(status)
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message || 'Não foi possível processar o arquivo CSV.'}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses, normalizeForComparison]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon')) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [header]: [...currentOptions, option] };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null);
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => {
      const newState = { ...prev };
      delete newState[header];
      return newState;
    });
    setOpenFilterDropdown(null);
  }, []);

  const isOverdue = useCallback((dateString) => {
    if (!dateString) return false;
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const limitDate = new Date(year, month, day);
    limitDate.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return limitDate < today;
  }, []);

  const isDueToday = useCallback((dateString) => {
    if (!dateString) return false;
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const limitDate = new Date(year, month, day);
    limitDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return limitDate.getTime() === today.getTime();
  }, []);

  const getRowClass = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    const isRowOverdue = isOverdue(dataLimite);
    const isRowDueToday = isDueToday(dataLimite);
    const needsAbono = isRowOverdue && (!justificativa || justificativa.trim() === '');

    if (needsAbono || isRowOverdue) {
      return 'row-overdue';
    } else if (isRowDueToday) {
      return 'row-due-today';
    } else {
      return 'row-default-blue';
    }
  }, [isOverdue, isDueToday]);

  const getJustificativaCellText = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);

    if (isRowOverdue && (!justificativa || justificativa.trim() === '')) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue]);

  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);

    if (isRowOverdue && (!justificativa || justificativa.trim() === '')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' };
    }
    return {};
  }, [isOverdue]);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header] || '').includes(normalizedSearchTerm)
        )
      );
    }

    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(String(row[header] || ''))
        );
      }
    });

    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = aValue ? new Date(aValue.split('/')[2], aValue.split('/')[1] - 1, aValue.split('/')[0]) : null;
          const dateB = bValue ? new Date(bValue.split('/')[2], bValue.split('/')[1] - 1, bValue.split('/')[0]) : null;

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        const valA = normalizeForComparison(aValue);
        const valB = normalizeForComparison(bValue);

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison]);

  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row['Data Limite'])).length;
  }, [filteredAndSortedData, isOverdue]);

  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingTodayData = filteredAndSortedData.filter(row => {
      const dataLimite = row['Data Limite'];
      return isOverdue(dataLimite) || isDueToday(dataLimite);
    });

    if (pendingTodayData.length === 0) {
      alert('Não há dados pendentes para exportar hoje.');
      return;
    }

    const wsData = [
      tableHeaders.map(header => ({ v: header, t: 's', s: {
        fill: { fgColor: { rgb: "FF336699" } },
        font: { bold: true, color: { rgb: "FFFFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } }
        }
      }})),
      ...pendingTodayData.map(row => tableHeaders.map(header => {
        let cellValue = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
        let cellStyle = {};

        const isRowOverdue = isOverdue(row['Data Limite']);
        const isRowDueToday = isDueToday(row['Data Limite']);
        const needsAbono = isRowOverdue && (!row['Justificativa do Abono'] || String(row['Justificativa do Abono']).trim() === '');

        if (needsAbono || isRowOverdue) {
          cellStyle.fill = { fgColor: { rgb: "FFC00000" } };
          cellStyle.font = { color: { rgb: "FFFFFFFF" } };
        } else if (isRowDueToday) {
          cellStyle.fill = { fgColor: { rgb: "FFFFC000" } };
          cellStyle.font = { color: { rgb: "FF333333" } };
        } else {
          cellStyle.fill = { fgColor: { rgb: "FFE0F2F7" } };
          cellStyle.font = { color: { rgb: "FF333333" } };
        }

        if (header === 'Justificativa do Abono' && needsAbono) {
          cellValue = 'FALTA ABONAR';
          cellStyle.fill = { fgColor: { rgb: "FF800080" } };
          cellStyle.font = { bold: true, color: { rgb: "FFFFFFFF" } };
        }

        if (header === 'Data Limite') {
          cellValue = formatDataLimite(row[header]);
          cellStyle.numFmt = 'DD/MM/YYYY';
        }

        if (header === 'CNPJ / CPF') {
          cellStyle.numFmt = '@';
        }

        cellStyle.border = {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } }
        };

        return { v: cellValue, t: 's', s: cellStyle };
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const wscols = tableHeaders.map(header => {
      let width = 15;
      switch (header) {
        case 'Chamado': width = 15; break;
        case 'Numero Referencia': width = 20; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 20; break;
        case 'Data Limite': width = 18; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 25; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 40; break;
        default: width = 20; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
      </header>

      <div className="action-buttons-container">
        <div className="file-upload-section">
          <label htmlFor="csv-upload" className="custom-file-upload">
            {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
            {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
          </button>
        </div>

        <div className="global-actions-section">
          <div className="search-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar na tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
            Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            OSs Atrasadas: {overdueCount}
          </div>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {loading && data.length === 0 && <p className="loading-message">Carregando dados...</p>}
      {!loading && data.length === 0 && !error && (
        <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
      )}
      {!loading && data.length > 0 && filteredAndSortedData.length === 0 && (
        <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
      )}

      {data.length > 0 && filteredAndSortedData.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon" />}
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => String(row[header] || ''))))
                                .filter(option => option !== undefined && option !== null && option !== '')
                                .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                .map(option => (
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
