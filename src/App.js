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
        // Extrai todos os valores únicos para cada cabeçalho para as opções de filtro
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const values = new Set();
          result.forEach(row => {
            if (row[header]) {
              values.add(String(row[header]).trim());
            }
          });
          newFilterOptions[header] = Array.from(values).sort((a, b) => {
            // Tenta ordenar datas se for a coluna Data Limite
            if (header === 'Data Limite') {
              const dateA = parseDateForComparison(a);
              const dateB = parseDateForComparison(b);
              if (dateA && dateB) return dateA.getTime() - dateB.getTime();
            }
            return String(a).localeCompare(String(b));
          });
        });
        setFilterOptions(newFilterOptions);
        setTableHeaders(defaultTableHeaders); // Garante que os cabeçalhos padrão sejam usados
      } else {
        setData([]);
        setTableHeaders([]);
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
  }, [file, backendUrl, defaultTableHeaders, parseDateForComparison]);

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
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
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

        let comparison = 0;
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(valA);
          const dateB = parseDateForComparison(valB);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Ordenação padrão para outras colunas (string)
        const normalizedA = normalizeForComparison(valA);
        const normalizedB = normalizeForComparison(valB);

        if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
        if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, tableHeaders]);

  // Filtra os dados para exportação (apenas pendências de hoje)
  const filteredForExport = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Exporta os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    if (filteredForExport.length === 0) {
      alert('Não há dados para exportar para o Excel.');
      return;
    }

    // Prepara os dados para a planilha, incluindo os cabeçalhos como a primeira linha
    const ws_data = [tableHeaders]; // Cabeçalhos na primeira linha

    filteredForExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        let value = row[header];
        // Formatação especial para 'Data Limite'
        if (header === 'Data Limite') {
          const date = parseDateForComparison(value);
          if (date && !isNaN(date)) {
            // Converte a data para o número de série do Excel manualmente
            const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
            const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
            const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
            return excelDate; // Retorna o número de série
          }
          return ''; // Retorna vazio se a data for inválida
        }
        // Formatação especial para 'CNPJ / CPF'
        if (header === 'CNPJ / CPF') {
          return String(value || '').replace(/['"=]/g, '').trim();
        }
        // Formatação especial para 'Justificativa do Abono'
        if (header === 'Justificativa do Abono' && isOverdue(row) && isAbonarCondition(row)) {
          return 'FALTA ABONAR';
        }
        return String(value || ''); // Retorna o valor como string para outras colunas
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new(); // Declaração de wb aqui
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // --- Aplicação de Estilos ---
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Estilos base
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, name: "Calibri", sz: 11 }, // Branco, Calibri 11
      fill: { fgColor: { argb: 'FF4472C4' } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { argb: 'FF000000' } },
        bottom: { style: "thin", color: { argb: 'FF000000' } },
        left: { style: "thin", color: { argb: 'FF000000' } },
        right: { style: "thin", color: { argb: 'FF000000' } },
      }
    };

    const defaultRowBaseStyle = {
      font: { color: { argb: 'FF000000' }, name: "Calibri", sz: 11 }, // Preto, Calibri 11
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { argb: 'FFD3D3D3' } }, // Cinza claro
        bottom: { style: "thin", color: { argb: 'FFD3D3D3' } },
        left: { style: "thin", color: { argb: 'FFD3D3D3' } },
        right: { style: "thin", color: { argb: 'FFD3D3D3' } },
      }
    };

    const overdueRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { argb: 'FFFFC7CE' } }, // Vermelho claro
      font: { color: { argb: 'FF9C0006' }, bold: true, name: "Calibri", sz: 11 }, // Vermelho escuro, negrito
    };

    const dueTodayRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { argb: 'FFFFFFEB' } }, // Amarelo claro
      font: { color: { argb: 'FF9C6500' }, bold: true, name: "Calibri", sz: 11 }, // Amarelo escuro, negrito
    };

    const abonarCellStyle = {
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      font: { bold: true, color: { argb: 'FFFFFFFF' }, name: "Calibri", sz: 11 }, // Branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { argb: 'FF000000' } },
        bottom: { style: "thin", color: { argb: 'FF000000' } },
        left: { style: "thin", color: { argb: 'FF000000' } },
        right: { style: "thin", color: { argb: 'FF000000' } },
      }
    };

    // Aplica estilos às células
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[cellAddress];

        if (!cell) { // Se a célula não existe, cria uma com tipo string e valor vazio
          cell = { t: 's', v: '' };
          ws[cellAddress] = cell;
        }

        let currentCellStyle = {};

        if (R === 0) { // Estilo do cabeçalho
          currentCellStyle = { ...headerStyle };
        } else { // Estilos para as linhas de dados
          const originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
          let baseStyleForDataRow = { ...defaultRowBaseStyle };

          if (isOverdue(originalRowData)) {
            Object.assign(baseStyleForDataRow, overdueRowBaseStyle);
          } else if (isDueToday(originalRowData)) {
            Object.assign(baseStyleForDataRow, dueTodayRowBaseStyle);
          }
          currentCellStyle = { ...baseStyleForDataRow }; // Aplica o estilo base da linha

          const header = tableHeaders[C];

          // Lógica para "FALTA ABONAR"
          if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            Object.assign(currentCellStyle, abonarCellStyle); // Mescla o estilo de abonar
          }

          // Alinhamentos específicos para colunas
          if (['Chamado', 'Numero Referencia', 'Status', 'Data Limite', 'Cidade'].includes(header)) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          } else if (['CNPJ / CPF', 'Serviço', 'Contratante', 'Cliente', 'Técnico', 'Prestador', 'Justificativa do Abono'].includes(header)) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
          }

          // Formatação de Data Limite
          if (header === 'Data Limite') {
            currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de exibição
          }
        }
        cell.s = currentCellStyle; // Aplica o estilo final à célula
      }
    }

    // Ajusta a largura das colunas
    const colWidths = tableHeaders.map(header => {
      let maxWidth = header.length; // Largura mínima baseada no cabeçalho
      // Encontra a largura máxima para cada coluna nos dados
      filteredForExport.forEach(row => {
        const cellValue = String(row[header] || '');
        if (cellValue.length > maxWidth) {
          maxWidth = cellValue.length;
        }
      });
      return { wch: maxWidth + 2 }; // Adiciona um pouco de padding
    });
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

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
