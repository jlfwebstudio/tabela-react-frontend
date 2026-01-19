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
  const [currentOverdueCount, setCurrentOverdueCount] = useState(0); // Contador de pendências

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

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return normalizedJustificativa === '' || normalizedJustificativa === 'falta abonar';
  }, [normalizeForComparison]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  const getJustificativaCellStyle = useCallback((row) => {
    if (isOverdue(row) && isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
        textAlign: 'center'
      };
    }
    return {};
  }, [isOverdue, isAbonarCondition]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    if (isOverdue(row) && isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue, isAbonarCondition]);

  // Retorna a classe CSS para a linha da tabela com base no status da OS
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Lida com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Lida com o upload do arquivo CSV para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // Usando 'file' como nome do campo, conforme o backend espera

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `Erro no servidor: ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMessage += ` - ${errorBody.message || JSON.stringify(errorBody)}`;
        } catch (e) {
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 200)}...`; // Limita o tamanho do texto para não poluir
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      if (result && result.length > 0) {
        setData(result);
        // Extrai todos os cabeçalhos únicos dos dados, mantendo a ordem dos defaultTableHeaders
        const extractedHeaders = Array.from(new Set(result.flatMap(Object.keys)));
        const orderedHeaders = defaultTableHeaders.filter(header => extractedHeaders.includes(header));
        const remainingHeaders = extractedHeaders.filter(header => !defaultTableHeaders.includes(header));
        setTableHeaders([...orderedHeaders, ...remainingHeaders]);

        // Popula as opções de filtro
        const newFilterOptions = {};
        [...orderedHeaders, ...remainingHeaders].forEach(header => {
          if (header !== 'Justificativa do Abono' && header !== 'CNPJ / CPF') { // Não filtra justificativa e CNPJ/CPF
            const options = Array.from(new Set(result.map(row => String(row[header] || '').trim())))
                                 .filter(option => option !== '')
                                 .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
            newFilterOptions[header] = options;
          }
        });
        setFilterOptions(newFilterOptions);

        // Reinicia filtros selecionados para incluir novas opções, se houver
        setSelectedFilterOptions(prev => {
          const newSelected = { ...prev };
          orderedHeaders.forEach(header => {
            if (!newSelected[header] || newSelected[header].length === 0) {
              // Se não houver filtros pré-selecionados para esta coluna, selecione todos por padrão
              newSelected[header] = newFilterOptions[header];
            } else {
              // Se houver, garanta que os filtros existentes ainda são válidos e adicione novos se necessário
              newSelected[header] = newSelected[header].filter(opt => newFilterOptions[header].includes(opt));
            }
          });
          return newSelected;
        });

      } else {
        setData([]);
        setTableHeaders([]);
        setFilterOptions({});
        setSelectedFilterOptions({});
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
      setTableHeaders([]);
      setFilterOptions({});
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison, parseDateForComparison]);

  // Lida com a mudança no termo de pesquisa
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Lida com a mudança de seleção de opções de filtro
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const current = prev[column] || [];
      if (current.includes(option)) {
        return { ...prev, [column]: current.filter(item => item !== option) };
      } else {
        return { ...prev, [column]: [...current, option] };
      }
    });
  }, []);

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
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


  // Filtra e ordena os dados da tabela
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filtered = filtered.filter(row =>
        tableHeaders.some(header => {
          const cellValue = String(row[header] || '');
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // Aplica filtros de coluna
    filtered = filtered.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Nenhuma opção selecionada, não filtra por esta coluna
        }
        const cellValue = String(row[header] || '').trim();
        return selectedOptions.includes(cellValue);
      });
    });

    // Calcula o contador de pendências atrasadas
    let overdueCount = 0;
    filtered.forEach(row => {
      if (isOverdue(row)) {
        overdueCount++;
      }
    });
    setCurrentOverdueCount(overdueCount);

    // Aplica ordenação
    if (sortColumn) {
      filtered.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        let resultComparison = 0; // CORREÇÃO AQUI: Renomeado 'comparison' para 'resultComparison'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(valA);
          const dateB = parseDateForComparison(valB);

          if (!dateA && !dateB) resultComparison = 0;
          else if (!dateA) resultComparison = sortDirection === 'asc' ? 1 : -1;
          else if (!dateB) resultComparison = sortDirection === 'asc' ? -1 : 1;
          else resultComparison = dateA.getTime() - dateB.getTime();
        } else {
          resultComparison = normalizeForComparison(valA).localeCompare(normalizeForComparison(valB));
        }

        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      });
    }

    return filtered;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, tableHeaders]);


  // Filtra os dados para exportação (apenas pendências de hoje)
  const filteredForExport = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row));
  }, [data, isOverdue, isDueToday]);

  // Exporta os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    if (filteredForExport.length === 0) {
      alert('Não há dados para exportar para o Excel.');
      return;
    }

    const ws_name = "Pendencias";
    const wb = XLSX.utils.book_new();

    // Prepara os dados para a planilha, incluindo os cabeçalhos como a primeira linha
    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos como primeira linha (apenas valores)

    filteredForExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        let value = row[header];
        // Não pré-formata datas ou CNPJ/CPF aqui, pois os estilos e tipos serão aplicados no loop de células
        return value;
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, ws_name); // Adiciona a planilha ao workbook

    // --- Aplicação de Estilos ---
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Estilos base para o Excel
    const baseBorder = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    const headerStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FF4472C4" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: baseBorder,
    };

    const defaultRowStyle = {
      font: { color: { argb: "FF000000" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FFFFFFFF" } }, // Fundo branco
      alignment: { vertical: "center", wrapText: false },
      border: baseBorder,
    };

    const overdueRowStyle = {
      font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FFC00000" } }, // Vermelho intenso
      alignment: { vertical: "center", wrapText: false },
      border: baseBorder,
    };

    const dueTodayRowStyle = {
      font: { color: { argb: "FF000000" }, bold: true, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FFFFC000" } }, // Amarelo
      alignment: { vertical: "center", wrapText: false },
      border: baseBorder,
    };

    const abonarCellStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { argb: "FF800080" } }, // Roxo intenso
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: baseBorder,
    };

    // Itera sobre as células para aplicar estilos e formatação
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const originalRowData = filteredForExport[R - 1]; // -1 porque R=0 é o cabeçalho
      let currentRowBaseStyle = { ...defaultRowStyle };

      if (R === 0) { // Cabeçalho
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: tableHeaders[C] || '' };
          ws[cellAddress].s = { ...headerStyle };
        }
        continue; // Pula para a próxima linha após estilizar o cabeçalho
      }

      // Linhas de dados
      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = { ...overdueRowStyle };
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = { ...dueTodayRowStyle };
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[cellAddress];
        if (!cell) { cell = { t: 's', v: '' }; ws[cellAddress] = cell; }

        let currentCellStyle = { ...currentRowBaseStyle }; // Começa com o estilo base da linha

        const header = tableHeaders[C];

        // Lógica para "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
          Object.assign(currentCellStyle, abonarCellStyle); // Mescla o estilo roxo
          cell.v = 'FALTA ABONAR'; // Garante o texto
          cell.t = 's'; // Tipo string
        }
        // Formatação de Data Limite
        else if (header === 'Data Limite') {
          const dateValue = originalRowData[header];
          const date = parseDateForComparison(dateValue);
          if (date && !isNaN(date)) {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const diffTime = date.getTime() - excelEpoch.getTime();
            const excelDate = diffTime / (1000 * 60 * 60 * 24);
            cell.v = excelDate; // Valor numérico
            cell.t = 'n'; // Tipo número
            currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de exibição
          } else {
            cell.v = dateValue; // Mantém o valor original se inválido
            cell.t = 's'; // Tipo string
          }
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        }
        // CNPJ / CPF como texto
        else if (header === 'CNPJ / CPF') {
          cell.v = String(originalRowData[header] || '').replace(/['"=]/g, '').trim();
          cell.t = 's'; // Força como texto
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        }
        // Alinhamento para outras colunas
        else if (['Chamado', 'Numero Referencia', 'Status', 'Cidade', 'Técnico', 'Prestador'].includes(header)) {
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        } else {
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
        }

        cell.s = currentCellStyle; // Aplica o estilo final à célula
      }
    }

    // Ajusta a largura das colunas dinamicamente
    const colWidths = tableHeaders.map(header => {
      let maxWidth = header.length; // Largura mínima baseada no cabeçalho
      filteredForExport.forEach(row => {
        const cellValue = String(row[header] || '');
        if (cellValue.length > maxWidth) {
          maxWidth = cellValue.length;
        }
      });
      return { wch: Math.min(maxWidth + 2, 60) }; // Adiciona padding e limita a largura máxima
    });
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Define a cor da aba (Sheet Tab Color)
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
    wb.Workbook.Views[0].TabColor = { rgb: "FF4472C4" }; // Azul escuro

    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredForExport, tableHeaders, todayFormatted, isOverdue, isAbonarCondition, isDueToday, parseDateForComparison]);


  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">Painel de Pendências</h1>
          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="action-button upload-action-button">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              <button onClick={handleUpload} disabled={!file || loading} className="action-button">
                {loading ? 'Processando...' : 'Carregar Dados'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <button onClick={exportToExcel} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <p className="error-message">Erro: {error}</p>}

      {data.length > 0 && (
        <div className="table-wrapper"> {/* Wrapper para rolagem horizontal */}
          <div className="overdue-count-display">
            <h3>Pendências Atrasadas: {currentOverdueCount}</h3>
          </div>
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
