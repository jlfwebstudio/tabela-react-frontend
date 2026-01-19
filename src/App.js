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
  const filterButtonRefs = useRef({}); // Para fechar o dropdown ao clicar em outro botão de filtro

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
    const cleanedDateString = String(dateString).split(' ')[0].trim(); // Pega só a parte da data e limpa espaços

    // Tenta formato DD/MM/YYYY
    let parts = cleanedDateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
      if (!isNaN(date.getTime())) return date;
    }

    // Tenta formato YYYY-MM-DD (comum em alguns sistemas ou CSVs)
    parts = cleanedDateString.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    // Fallback para o parser nativo (pode funcionar com outros formatos)
    const nativeDate = new Date(cleanedDateString);
    nativeDate.setHours(0, 0, 0, 0);
    if (!isNaN(nativeDate.getTime())) return nativeDate;

    return null; // Retorna null se não conseguir parsear
  }, []);

  // Obtém a data de hoje, zerando a hora para comparações precisas
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

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    return isOverdue(row) && (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);

  // Retorna a classe CSS para a linha da tabela
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul clarinho
  }, [isOverdue, isDueToday]);

  // Retorna o estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: 'white',
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isAbonarCondition]);

  // Retorna o texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isAbonarCondition]);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  // Contador de pendências (OSs atrasadas ou vencendo hoje)
  const overdueCountDisplay = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Lida com a seleção do arquivo CSV
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]);
    setTableHeaders([]);
  };

  // Processa o arquivo CSV
  const processCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // O backend espera 'file'

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar o arquivo CSV.');
      }

      const result = await response.json();
      if (result.length > 0) {
        // Garante que os cabeçalhos da tabela sigam a ordem definida em defaultTableHeaders
        const actualHeaders = Object.keys(result[0]);
        const orderedHeaders = defaultTableHeaders.filter(header => actualHeaders.includes(header));
        setTableHeaders(orderedHeaders);
        setData(result);

        // Inicializa as opções de filtro
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(row => String(row[header] || '').trim()))].filter(Boolean).sort();
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);

        // Reseta os filtros selecionados para o estado inicial (Status filtrado)
        setSelectedFilterOptions({
          'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
        });

      } else {
        setData([]);
        setTableHeaders([]);
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de filtragem e ordenação
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // Aplica filtro de texto
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    currentData = currentData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se não há opções selecionadas para este cabeçalho, não filtra
        }
        const rowValue = String(row[header]).trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Aplica ordenação
    if (sortColumn) {
      currentData = [...currentData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : 1; // Coloca inválidas no final para asc
          if (!dateB) return sortDirection === 'asc' ? -1 : -1; // Coloca inválidas no final para asc

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
            : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
        } else {
          // Fallback para outros tipos ou valores não string
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    return currentData;
  }, [data, searchTerm, tableHeaders, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Lida com a ordenação da tabela
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Lida com a mudança de opção de filtro
  const handleFilterOptionChange = (header, option) => {
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
  };

  // Limpa o filtro de uma coluna específica
  const clearColumnFilter = (header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
  };

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum dos botões de filtro
        const clickedOnFilterButton = Object.values(filterButtonRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterButton) {
          setActiveFilterColumn(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para exportar os dados filtrados e ordenados para Excel com estilos
  const exportToExcel = useCallback(() => {
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    // Mapeia os dados para o formato esperado pelo XLSX.utils.json_to_sheet
    const dataForSheet = filteredForExport.map(row => {
      const newRow = {};
      defaultTableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          const date = parseDateForComparison(row[header]);
          // Usa XLSX.utils.date_to_num para converter para o formato numérico do Excel
          newRow[header] = date ? XLSX.utils.date_to_num(date) : ''; 
        } else if (header === 'CNPJ / CPF') {
          newRow[header] = String(row[header] || '').replace(/['"=]/g, '').trim();
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row);
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(dataForSheet, { header: defaultTableHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // --- Definição de Estilos ---
    const baseBorder = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    const headerStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", sz: 12 },
      fill: { fgColor: { argb: "FF4472C4" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: baseBorder,
    };

    const defaultBlueRowStyle = {
      font: { color: { argb: "FF000000" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FFE0F2F7" } }, // Azul claro suave (para OSs futuras)
      alignment: { horizontal: "left", vertical: "center" },
      border: baseBorder,
    };

    const overdueRowStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", sz: 11 }, // Texto branco
      fill: { fgColor: { argb: "FFC00000" } }, // Vermelho intenso
      alignment: { horizontal: "left", vertical: "center" },
      border: baseBorder,
    };

    const dueTodayRowStyle = {
      font: { bold: true, color: { argb: "FF000000" }, name: "Calibri", sz: 11 }, // Texto preto
      fill: { fgColor: { argb: "FFFFC000" } }, // Amarelo
      alignment: { horizontal: "left", vertical: "center" },
      border: baseBorder,
    };

    const abonarCellStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", sz: 11 }, // Branco
      fill: { fgColor: { argb: "FF800080" } }, // Roxo intenso
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: baseBorder,
    };

    // --- Aplicação de Estilos e Formatos ---
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Estilo do cabeçalho
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: defaultTableHeaders[C] || '' };
      ws[cellAddress].s = { ...headerStyle };
    }

    // Estilos para as linhas de dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Começa da linha 1 (dados)
      const originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
      let currentRowBaseStyle = { ...defaultBlueRowStyle }; // Estilo padrão: azul clarinho

      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = { ...overdueRowStyle }; // Vermelho para atrasado
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = { ...dueTodayRowStyle }; // Amarelo para vencendo hoje
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[cellAddress];
        if (!cell) { cell = { t: 's', v: '' }; ws[cellAddress] = cell; } // Garante que a célula exista

        // Aplica o estilo base da linha
        cell.s = { ...currentRowBaseStyle };

        const header = defaultTableHeaders[C];

        // Lógica para "FALTA ABONAR" (Roxo)
        if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
          Object.assign(cell.s, abonarCellStyle); // Mescla o estilo roxo
          cell.v = 'FALTA ABONAR'; // Garante o texto
          cell.t = 's'; // Tipo string
        }
        // Formatação de Data Limite (DD/MM/YYYY)
        else if (header === 'Data Limite') {
          // O valor já está como número de série do Excel devido à preparação em exportData
          cell.t = 'n'; // Tipo numérico
          cell.s.numFmt = 'DD/MM/YYYY'; // Formato de exibição
          Object.assign(cell.s.alignment, { horizontal: 'center' }); // Centraliza
        }
        // Formatação de CNPJ / CPF (Texto)
        else if (header === 'CNPJ / CPF') {
          // O valor já está como string devido à preparação em exportData
          cell.t = 's'; // Força como texto
          cell.s.numFmt = '@'; // Formato de texto
          Object.assign(cell.s.alignment, { horizontal: 'center' }); // Centraliza
        }
        // Alinhamento para outras colunas
        else if (['Chamado', 'Numero Referencia', 'Status', 'Cidade', 'Técnico', 'Prestador'].includes(header)) {
          Object.assign(cell.s.alignment, { horizontal: 'center' });
        } else {
          Object.assign(cell.s.alignment, { horizontal: 'left' });
        }
      }
    }

    // Ajustar largura das colunas dinamicamente
    const wscols = defaultTableHeaders.map(header => {
      let maxWidth = String(header).length; // Largura mínima baseada no cabeçalho
      filteredForExport.forEach(row => {
        const cellValue = String(row[header] || '');
        if (cellValue.length > maxWidth) {
          maxWidth = cellValue.length;
        }
      });
      return { wch: Math.min(maxWidth + 2, 60) }; // Adiciona padding e limita a largura máxima
    });
    ws['!cols'] = wscols;

    // Adicionar autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(defaultTableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congelar a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Definir a cor da aba
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
    wb.Workbook.Views[0].TabColor = { rgb: "FF4472C4" }; // Azul escuro

    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, defaultTableHeaders, todayFormatted, isOverdue, isDueToday, isAbonarCondition, parseDateForComparison, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de OSs</h1>
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
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCountDisplay}
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
                      <div className="filter-icon-container" ref={filterButtonRefs.current[header] = el => filterButtonRefs.current[header] = el}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
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
                              <button onClick={() => setActiveFilterColumn(null)}>Aplicar</button>
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
