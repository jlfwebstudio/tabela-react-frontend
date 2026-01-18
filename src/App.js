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
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
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
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Determina a classe CSS da linha com base no status e data
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);


  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' };
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


  // Função para obter opções de filtro para uma coluna
  const getColumnFilterOptions = useCallback((columnName) => {
    const options = new Set();
    data.forEach(row => {
      if (row[columnName]) {
        options.add(row[columnName]);
      }
    });
    return Array.from(options).sort((a, b) => String(a).localeCompare(String(b)));
  }, [data]);

  // Efeito para popular os cabeçalhos e opções de filtro quando os dados mudam
  useEffect(() => {
    if (data.length > 0) {
      setTableHeaders(defaultTableHeaders);
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        newFilterOptions[header] = getColumnFilterOptions(header);
      });
      setFilterOptions(newFilterOptions);
    } else {
      setTableHeaders([]);
      setFilterOptions({});
    }
  }, [data, defaultTableHeaders, getColumnFilterOptions]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef]);

  // Lida com a seleção de arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  };

  // Lida com o upload do arquivo CSV para o backend
  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
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
        throw new Error(errorData.error || 'Falha ao processar o arquivo CSV.');
      }

      const result = await response.json();
      // CORREÇÃO AQUI: O backend retorna o array de dados diretamente, não dentro de um objeto 'data'
      if (result && result.length > 0) { // Verifica se o array de resultados não está vazio
        setData(result); // Define os dados diretamente do resultado
      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao fazer upload: ${err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lógica de filtro por coluna
  const toggleFilterDropdown = useCallback((header) => {
    setActiveFilterColumn(prev => (prev === header ? null : header));
  }, []);

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
    setActiveFilterColumn(null);
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
    setActiveFilterColumn(null);
  }, []);

  // Lógica de busca global
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Dados filtrados e ordenados para exibição na tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header];
          return cellValue !== null && cellValue !== undefined && normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // Aplica filtros de coluna
    filteredData = filteredData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true;
        }
        const rowValue = String(row[header]).trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Aplica ordenação
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } else {
        const valA = normalizeForComparison(aValue);
        const valB = normalizeForComparison(bValue);
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Calcula o número de pendentes hoje (atrasados ou vencendo hoje)
  const overdueCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);


  // Função para exportar dados para Excel
  const exportToExcel = useCallback(() => {
    const filteredForExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há dados pendentes para exportar hoje.');
      return;
    }

    const exportData = filteredForExport.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        let value = row[header];
        if (header === 'CNPJ / CPF' && value) {
          value = String(value).replace(/[^\d]/g, '');
        } else if (header === 'Justificativa do Abono') {
          value = getJustificativaCellText(row);
        }
        newRow[header] = value;
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData, { header: tableHeaders });

    ws['!cols'] = [
      { wch: 12 }, // Chamado
      { wch: 18 }, // Numero Referencia
      { wch: 15 }, // Contratante
      { wch: 30 }, // Serviço
      { wch: 20 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 25 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 15 }, // Cidade
      { wch: 20 }, // Técnico
      { wch: 20 }, // Prestador
      { wch: 25 }  // Justificativa do Abono
    ];

    const headerStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4472C4" } },
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const overdueRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "C00000" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const dueTodayRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "000000" } },
      fill: { fgColor: { rgb: "FFC000" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const defaultRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "000000" } },
      fill: { fgColor: { rgb: "E0F2F7" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const abonarCellStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "800080" } },
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = {};

        let cellStyle = { ...defaultRowStyle }; // Começa com o estilo padrão da linha

        if (R === 0) { // Linha do cabeçalho
          cellStyle = headerStyle;
        } else { // Linhas de dados
          const rowData = filteredForExport[R - 1]; // -1 porque a primeira linha é o cabeçalho
          if (isOverdue(rowData)) {
            cellStyle = overdueRowStyle;
          } else if (isDueToday(rowData)) {
            cellStyle = dueTodayRowStyle;
          }
          // Aplica o alinhamento horizontal específico para cada coluna de dados
          const header = tableHeaders[C];
          if (header === 'Data Limite' || header === 'Justificativa do Abono' || header === 'Chamado' || header === 'Numero Referencia' || header === 'Status') {
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
          } else if (['Serviço', 'Contratante', 'Cliente', 'CNPJ / CPF', 'Cidade', 'Técnico', 'Prestador'].includes(header)) {
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" };
          }
        }

        // Sobrescreve o estilo da célula "Justificativa do Abono" se for "FALTA ABONAR"
        if (R > 0 && tableHeaders[C] === 'Justificativa do Abono') {
          const rowData = filteredForExport[R - 1];
          const justificativa = normalizeForComparison(rowData['Justificativa do Abono']);
          const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';
          if (isOverdue(rowData) && isAbonarCondition) {
            cellStyle = { ...abonarCellStyle }; // Usa o estilo roxo completo
          }
        }

        // Formatação de Data Limite
        if (R > 0 && tableHeaders[C] === 'Data Limite') {
          const rowData = filteredForExport[R - 1];
          const date = parseDateForComparison(rowData['Data Limite']);
          if (date && !isNaN(date)) {
            ws[cellAddress].v = XLSX.utils.date_to_num(date, { date1904: false }); // Converte para número de série do Excel
            ws[cellAddress].t = 'n'; // Tipo número
            cellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
          } else {
            ws[cellAddress].v = String(rowData['Data Limite'] || '');
            ws[cellAddress].t = 's'; // Tipo string
          }
        } else {
          // Para outras células, o valor já foi definido no json_to_sheet ou no mapeamento inicial
          // Apenas garantimos que o tipo esteja correto se for um número (como no caso de datas que não foram formatadas)
          if (R > 0 && typeof ws[cellAddress].v === 'number' && !isNaN(ws[cellAddress].v)) {
            ws[cellAddress].t = 'n';
          } else if (R > 0) {
            ws[cellAddress].t = 's'; // Garante que seja string por padrão
          }
        }

        ws[cellAddress].s = cellStyle; // Aplica o estilo final à célula
      }
    }

    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes');

    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
    wb.Workbook.Views[0].TabColor = { rgb: "4472C4" };

    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);

  }, [data, tableHeaders, isOverdue, isDueToday, getJustificativaCellText, parseDateForComparison, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em toda a tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
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
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
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
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
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
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
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
