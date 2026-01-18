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
      // Atenção: Mês em JavaScript é 0-indexado (janeiro é 0, dezembro é 11)
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return null;
  }, []);

  // Formata a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Tenta parsear como Date object ou string DD/MM/YYYY
    let date;
    if (dateString instanceof Date) {
      date = dateString;
    } else {
      const parts = String(dateString).split(' ')[0].split('/'); // Pega só a data e divide
      if (parts.length === 3) {
        date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        return dateString; // Retorna original se não conseguir formatar
      }
    }

    if (isNaN(date.getTime())) return dateString; // Se a data for inválida, retorna a string original

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  // Funções para verificar status de data
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data
    return dataLimite < today;
  }, [parseDateForComparison]);

  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Função para determinar a classe CSS da linha
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    // eslint-disable-next-line no-unused-vars
    const isAbonar = isOverdue(row) && (justificativa === 'falta abonar' || justificativa === ''); // Desabilita lint para esta linha

    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasadas
    } else if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para os demais
  }, [isOverdue, isDueToday, normalizeForComparison]);


  // Função para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = isOverdue(row) && (justificativa === 'falta abonar' || justificativa === '');

    if (isAbonarCondition) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso, texto branco
    }
    return {}; // Sem estilo especial
  }, [isOverdue, normalizeForComparison]);

  // Função para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = isOverdue(row) && (justificativa === 'falta abonar' || justificativa === '');

    if (isAbonarCondition) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // eslint-disable-next-line no-unused-vars
  const fetchInitialData = useCallback(async () => { // Desabilita lint para esta linha
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/initial-data`); // Exemplo de endpoint GET
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders);
        const initialFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(item => item[header]))].filter(Boolean).sort();
          initialFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(initialFilterOptions);
      } else {
        setData([]);
        setTableHeaders([]);
      }
    } catch (e) {
      console.error("Erro ao carregar dados iniciais:", e);
      setError(`Falha ao carregar dados iniciais: ${e.message}. Por favor, faça o upload de um arquivo.`);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, defaultTableHeaders]);

  // Efeito para buscar os dados iniciais ou quando o componente monta
  useEffect(() => {
    // fetchInitialData(); // Comentado para evitar chamada GET inicial se o backend não tiver um endpoint para isso
  }, []); // Array de dependências vazio para rodar apenas uma vez


  // Lida com o upload do arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
  };

  // Processa o CSV
  const handleProcessCsv = async () => {
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
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders); // Garante que os cabeçalhos padrão sejam usados
        // Atualiza as opções de filtro com base nos novos dados
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(item => item[header]))].filter(Boolean).sort();
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);
      } else {
        setData([]);
        setTableHeaders([]);
        setError('O arquivo CSV foi processado, mas nenhum dado válido foi extraído.');
      }
    } catch (e) {
      console.error("Erro ao processar CSV:", e);
      setError(`Falha ao processar o arquivo CSV: ${e.message}`);
      setData([]);
      setTableHeaders([]);
    } finally {
      setLoading(false);
    }
  };

  // Lida com a ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lida com a pesquisa global
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(activeFilterColumn === column ? null : column);
  }, [activeFilterColumn]);

  // Lida com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [column]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [column]: [...currentOptions, option] };
      }
    });
  }, []);

  // Aplica os filtros selecionados
  const applyFilters = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
        !event.target.closest('.filter-icon-container')) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // Dados filtrados e pesquisados
  const filteredAndSearchedData = useMemo(() => {
    let currentData = data;

    // Aplica filtros de coluna
    currentData = currentData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra
        return selectedOptions.includes(row[column]);
      });
    });

    // Aplica pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, normalizeForComparison]);


  // Dados ordenados
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredAndSearchedData;

    return [...filteredAndSearchedData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      let comparison = 0;

      // Lógica de comparação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA && dateB) {
          comparison = dateA.getTime() - dateB.getTime();
        } else if (dateA) {
          comparison = -1; // A tem data, B não
        } else if (dateB) {
          comparison = 1; // B tem data, A não
        } else {
          comparison = 0; // Ambos sem data
        }
      } else {
        // Comparação padrão para outros tipos (string, number)
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);

        if (normalizedA < normalizedB) {
          comparison = -1;
        } else if (normalizedA > normalizedB) {
          comparison = 1;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredAndSearchedData, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison]);

  // Contagem de pendências para o botão "Exportar Pendentes Hoje"
  const overdueAndDueTodayCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);


  // Função para exportar para Excel com estilos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    const dataToExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há pendências atrasadas ou vencendo hoje para exportar.');
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

    XLSX.utils.sheet_add_aoa(ws, [defaultTableHeaders], { origin: "A1" }); // Usa defaultTableHeaders para a ordem

    // Aplica o estilo aos cabeçalhos
    defaultTableHeaders.forEach((_, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Adiciona os dados com estilos de linha e célula
    dataToExport.forEach((row, rowIndex) => {
      const rowClass = getRowClass(row);
      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
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

      defaultTableHeaders.forEach((header, colIndex) => { // Itera sobre defaultTableHeaders para manter a ordem
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
          const isAbonarCondition = isOverdue(row) && (normalizeForComparison(row['Justificativa do Abono']) === 'falta abonar' || normalizeForComparison(row['Justificativa do Abono']) === '');
          if (isAbonarCondition) {
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
    const wscols = defaultTableHeaders.map(header => {
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
  }, [data, defaultTableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellStyle, getJustificativaCellText, formatDataLimite, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de OSs</h1>
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
            <button onClick={handleProcessCsv} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar em todas as colunas..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button
              onClick={exportToExcel}
              disabled={data.length === 0}
              className="export-button"
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje ({overdueAndDueTodayCount})
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      <main className="App-main">
        {loading && <p>Carregando dados...</p>}
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
                          <FontAwesomeIcon
                            icon={sortColumn === header ? (sortDirection === 'asc' ? faSortUp : faSortDown) : faSort}
                            className={`sort-icon ${sortColumn !== header ? 'inactive' : ''}`}
                          />
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
                {sortedData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {tableHeaders.map((header, colIndex) => (
                      <td
                        key={`${rowIndex}-${colIndex}`}
                        className={`col-${header.replace(/ /g, '-').replace(/\//g, '-').toLowerCase()}`}
                        style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                      >
                        {header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : (header === 'Justificativa do Abono'
                            ? getJustificativaCellText(row)
                            : row[header])
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.length === 0 && !loading && !error && (
          <p>Nenhum dado carregado. Por favor, faça o upload de um arquivo CSV.</p>
        )}
      </main>
    </div>
  );
}

export default App;
