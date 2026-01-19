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
  }, [isOverdue, isAbonarCondition]); // <-- CORREÇÃO AQUI: Removido normalizeForComparison

  // Define a classe da linha com base no status de atraso ou vencimento hoje
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Função para lidar com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // Nome do campo 'file' para o backend

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro no servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setData(result.data);
      setTableHeaders(defaultTableHeaders); // Garante a ordem dos cabeçalhos
      setFile(null); // Limpa o arquivo selecionado após o upload
      document.getElementById('csv-upload-input').value = ''; // Limpa o input de arquivo

      // Extrai opções de filtro únicas para cada coluna
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        if (header !== 'Justificativa do Abono') { // Não cria filtro para Justificativa do Abono
          const options = [...new Set(result.data.map(row => String(row[header] || '').trim()))].filter(Boolean).sort();
          newFilterOptions[header] = options;
        }
      });
      setFilterOptions(newFilterOptions);

    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Lida com a mudança de texto na barra de pesquisa
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Lida com a mudança de seleção de opções de filtro
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [column]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [column]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Aplica os filtros selecionados (não faz nada, apenas fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: []
    }));
    setActiveFilterColumn(null); // Fecha o dropdown
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
  }, []);

  // Filtra e ordena os dados da tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data.filter(row => {
      // Filtro por termo de pesquisa global
      const matchesSearch = searchTerm === '' || tableHeaders.some(header =>
        normalizeForComparison(String(row[header] || '')).includes(normalizeForComparison(searchTerm))
      );

      // Filtro por opções selecionadas em cada coluna
      const matchesColumnFilters = tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se não há opções selecionadas para esta coluna, não filtra
        }
        return selectedOptions.includes(String(row[header] || '').trim());
      });

      return matchesSearch && matchesColumnFilters;
    });

    // Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        let resultComparison = 0;

        if (sortColumn === 'Data Limite') {
          const aDate = parseDateForComparison(aValue);
          const bDate = parseDateForComparison(bValue);

          if (aDate && bDate) {
            resultComparison = aDate.getTime() - bDate.getTime();
          } else if (aDate) {
            resultComparison = -1;
          } else if (bDate) {
            resultComparison = 1;
          }
        } else {
          const aNormalized = normalizeForComparison(aValue);
          const bNormalized = normalizeForComparison(bValue);
          if (aNormalized < bNormalized) resultComparison = -1;
          if (aNormalized > bNormalized) resultComparison = 1;
        }

        return sortDirection === 'asc' ? resultComparison : -resultComparison;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, isDueToday, tableHeaders]);

  // Calcula o contador de pendências
  useEffect(() => {
    const count = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
    setCurrentOverdueCount(count);
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Prepara os dados para exportação (apenas pendências)
  const filteredForExport = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Função para exportar os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    if (filteredForExport.length === 0) {
      alert('Não há dados de pendências para exportar.');
      return;
    }

    const ws_name = "Pendências";
    const wb = XLSX.utils.book_new();

    // Cabeçalhos da planilha
    const excelHeaders = tableHeaders;

    // Prepara os dados para a planilha, aplicando formatação de data e CNPJ/CPF
    const exportData = filteredForExport.map(row => {
      const newRow = {};
      excelHeaders.forEach(header => {
        let value = row[header];
        if (header === 'Data Limite') {
          const dateObj = parseDateForComparison(value);
          // Converte para número de série do Excel se for uma data válida
          value = dateObj && !isNaN(dateObj) ? XLSX.utils.date_to_num(dateObj) : value;
        } else if (header === 'CNPJ / CPF') {
          // Garante que CNPJ/CPF seja tratado como string para evitar perda de zeros à esquerda
          value = String(value || '').replace(/['"=]/g, '').trim();
        } else if (header === 'Justificativa do Abono' && (isOverdue(row) && isAbonarCondition(row))) {
          value = 'FALTA ABONAR';
        }
        newRow[header] = value;
      });
      return newRow;
    });

    // Converte array de objetos para array de arrays para XLSX
    const aoaData = [excelHeaders, ...exportData.map(row => excelHeaders.map(header => row[header]))];
    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // --- Definição de Estilos ---
    const baseBorder = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    const headerStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { argb: "FF4472C4" } }, // Azul
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: baseBorder,
    };

    const defaultRowStyle = {
      font: { color: { argb: "FF000000" } }, // Preto
      fill: { fgColor: { argb: "FFFFFFFF" } }, // Branco
      alignment: { vertical: "center", horizontal: "left" },
      border: baseBorder,
    };

    const overdueRowStyle = {
      font: { color: { argb: "FF000000" } }, // Preto
      fill: { fgColor: { argb: "FFFFC7CE" } }, // Vermelho claro
      alignment: { vertical: "center", horizontal: "left" },
      border: baseBorder,
    };

    const dueTodayRowStyle = {
      font: { color: { argb: "FF000000" } }, // Preto
      fill: { fgColor: { argb: "FFFFEB9C" } }, // Amarelo claro
      alignment: { vertical: "center", horizontal: "left" },
      border: baseBorder,
    };

    const abonarCellStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { argb: "FF800080" } }, // Roxo intenso
      alignment: { vertical: "center", horizontal: "center" },
      border: baseBorder,
    };

    // Aplica estilos às células
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];

        if (!cell) continue; // Pula células vazias

        // Inicializa o objeto de estilo se não existir
        if (!cell.s) cell.s = {};

        // Estilo do cabeçalho
        if (R === 0) {
          Object.assign(cell.s, headerStyle);
        } else {
          // Estilo das linhas de dados
          const originalRowIndex = R - 1; // Ajusta para o índice do array exportData
          const originalRowData = filteredForExport[originalRowIndex]; // Pega os dados da linha original

          let currentRowBaseStyle = { ...defaultRowStyle }; // Começa com o estilo padrão

          if (isOverdue(originalRowData)) {
            currentRowBaseStyle = { ...overdueRowStyle };
          } else if (isDueToday(originalRowData)) {
            currentRowBaseStyle = { ...dueTodayRowStyle };
          }
          Object.assign(cell.s, currentRowBaseStyle);

          // Estilos específicos por coluna
          const header = excelHeaders[C];
          if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            Object.assign(cell.s, abonarCellStyle);
          }

          // Formato de data para 'Data Limite'
          if (header === 'Data Limite') {
            cell.t = 'n'; // Garante que o tipo é número
            cell.s.numFmt = 'DD/MM/YYYY';
            cell.s.alignment = { ...cell.s.alignment, horizontal: "center" }; // Centraliza a data
          }
          // Formato de texto para 'CNPJ / CPF'
          else if (header === 'CNPJ / CPF') {
            cell.t = 's'; // Garante que o tipo é string
            cell.s.numFmt = '@'; // Formato de texto
            cell.s.alignment = { ...cell.s.alignment, horizontal: "center" }; // Centraliza o CNPJ/CPF
          }
        }
      }
    }

    // Ajusta a largura das colunas dinamicamente
    ws['!cols'] = excelHeaders.map((header, i) => {
      const maxLength = Math.max(
        header.length,
        ...exportData.map(row => String(row[header]).length)
      );
      return { wch: maxLength + 2 }; // Adiciona um pequeno padding
    });

    XLSX.utils.book_append_sheet(wb, ws, ws_name);
    XLSX.writeFile(wb, `Pendencias_${todayFormatted}.xlsx`);
  }, [filteredForExport, tableHeaders, todayFormatted, parseDateForComparison, isOverdue, isAbonarCondition, isDueToday]);

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>Gestão de Pendências</h1>
          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="upload-button">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              <button onClick={handleUpload} disabled={!file || loading} className="action-button">
                {loading ? 'Processando...' : 'Upload CSV'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Pesquisar na tabela..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <button onClick={exportToExcel} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="table-container">
          <div className="summary-cards">
            <div className="card overdue-card">
              <h3>Pendências Atrasadas</h3>
              <p>{currentOverdueCount}</p>
            </div>
            {/* Outros cards de resumo podem ser adicionados aqui */}
          </div>
          <div className="table-wrapper"> {/* Wrapper para rolagem horizontal */}
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
          </div> {/* Fim do table-wrapper */}
        </div>
      )}
    </div>
  );
}

export default App;
