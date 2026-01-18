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
    const datePart = dateString.split(' ')[0]; // Garante que a data seja tratada como DD/MM/YYYY
    const parts = datePart.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return '';
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
    return dataLimite && dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    return dataLimite && dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Determina a classe CSS da linha com base no status e data
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    // eslint-disable-next-line no-unused-vars
    const isAbonar = justificativa === 'falta abonar' || justificativa === ''; // Desabilita lint para esta linha

    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho para atrasado
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para os demais
  }, [isOverdue, isDueToday, normalizeForComparison]);


  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


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

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]);
    setTableHeaders([]); // Limpa os cabeçalhos para que sejam redefinidos após o upload
    setSortColumn('Data Limite');
    setSortDirection('asc');
    setSearchTerm('');
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
    setActiveFilterColumn(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

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
        setTableHeaders(defaultTableHeaders); // Define os cabeçalhos padrão
        setData(result);

        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(row => row[header]))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);

      } else {
        setData([]);
        setTableHeaders([]);
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
      setTableHeaders([]);
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

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const toggleFilterDropdown = useCallback((columnName) => {
    setActiveFilterColumn(activeFilterColumn === columnName ? null : columnName);
  }, [activeFilterColumn]);

  const handleFilterOptionChange = useCallback((columnName, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[columnName] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [columnName]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [columnName]: [...currentOptions, option]
        };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null);
  }, []);

  const clearColumnFilter = useCallback((columnName) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [columnName]: []
    }));
    setActiveFilterColumn(null);
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // 1. Filtragem por termo de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtragem por colunas (dropdowns)
    currentData = currentData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true;
        const rowValue = normalizeForComparison(row[column]);
        return selectedOptions.some(option => normalizeForComparison(option) === rowValue);
      });
    });

    // 3. Ordenação
    const sortedData = [...currentData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      let comparison = 0;
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        comparison = dateA.getTime() - dateB.getTime();
      } else {
        const valA = aValue !== undefined && aValue !== null ? String(aValue) : '';
        const valB = bValue !== undefined && bValue !== null ? String(bValue) : '';
        comparison = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // CORREÇÃO: Renomeado para corresponder ao uso no JSX
  const overdueAndDueTodayCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);


  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    const dataToExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há dados atrasados ou vencendo hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet([]); // Cria uma planilha vazia

    // Adiciona os cabeçalhos com estilos
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

    XLSX.utils.sheet_add_aoa(ws, [tableHeaders], { origin: "A1" });

    // Aplica o estilo aos cabeçalhos
    tableHeaders.forEach((_, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Adiciona os dados com estilos de linha e célula
    dataToExport.forEach((row, rowIndex) => {
      const rowClass = getRowClass(row);
      let rowBgColor = "FFFFFFFF"; // Branco padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (rowClass === 'row-overdue') {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      } else if (rowClass === 'row-default-blue') {
        rowBgColor = "FFE0F2F7"; // Azul claro
        rowTextColor = "FF000000"; // Preto
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        let cellValue = row[header];
        // eslint-disable-next-line no-unused-vars
        const justificativaText = getJustificativaCellText(row); // Desabilita lint para esta linha

        let cellStyle = {
          font: { color: { rgb: rowTextColor } },
          fill: { fgColor: { rgb: rowBgColor } },
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          }
        };

        // Formatação específica para "Data Limite"
        if (header === 'Data Limite') {
          cellValue = formatDataLimite(cellValue); // Usa a string formatada DD/MM/YYYY
          cellStyle.numFmt = '@'; // Define como texto para manter o formato DD/MM/YYYY
        }

        // Formatação específica para "CNPJ / CPF"
        if (header === 'CNPJ / CPF') {
          cellValue = String(cellValue).replace(/[^\d]/g, ''); // Garante apenas dígitos
          cellStyle.numFmt = '@'; // Define como texto
        }

        // Estilo para "Justificativa do Abono" (FALTA ABONAR)
        if (header === 'Justificativa do Abono') {
          const isAbonarCondition = normalizeForComparison(row['Justificativa do Abono']) === 'falta abonar' || normalizeForComparison(row['Justificativa do Abono']) === '';
          if (isOverdue(row) && isAbonarCondition) {
            cellValue = 'FALTA ABONAR'; // Altera o texto para "FALTA ABONAR"
            cellStyle.fill = { fgColor: { rgb: "FF800080" } }; // Roxo intenso
            cellStyle.font = { bold: true, color: { rgb: "FFFFFFFF" } }; // Texto branco e negrito
          }
        }

        XLSX.utils.sheet_add_aoa(ws, [[cellValue]], { origin: cellRef });
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = cellStyle;
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 15; break;
        case 'Numero Referencia': width = 20; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 20; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 30; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 40; break;
        default: width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellStyle, getJustificativaCellText, formatDataLimite, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
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
                placeholder="Buscar na tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
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
                      <span className="header-text" onClick={() => handleSort(header)}>
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
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header || (selectedFilterOptions[header] && selectedFilterOptions[header].length > 0) ? 'active' : ''}`}
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
