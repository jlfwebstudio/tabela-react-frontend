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
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: Data Limite crescente (mais antigo para mais recente)
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
    const parts = dateString.split('/');
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
    const isAbonar = isOverdue(row) && (justificativa === 'falta abonar' || justificativa === '');

    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasadas
    } else if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para as demais
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


  // Efeito para buscar os dados iniciais ou quando o componente monta
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${backendUrl}/upload`); // Ou um endpoint GET para dados iniciais
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.length > 0) {
          setData(result);
          setTableHeaders(defaultTableHeaders); // Define os cabeçalhos padrão
          // Inicializa as opções de filtro com base nos dados carregados
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
    };

    // fetchInitialData(); // Comentado para evitar chamada GET inicial se o backend não tiver um endpoint para isso
  }, [backendUrl, defaultTableHeaders]); // Adicionado defaultTableHeaders como dependência

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
    let filteredData = data;

    // Aplica filtros de coluna
    filteredData = filteredData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra
        return selectedOptions.includes(row[column]);
      });
    });

    // Aplica pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    return filteredData;
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


  // Formata a data atual para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Função para exportar para Excel com estilos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    const dataToExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há pendências atrasadas ou vencendo hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: defaultTableHeaders });

    // Definir larguras das colunas
    const wscols = defaultTableHeaders.map(header => {
      const colName = header.replace(/ /g, '-').replace(/\//g, '-').toLowerCase();
      // Mapeia para as larguras definidas no CSS, ou um valor padrão
      const widthMap = {
        'chamado': 15,
        'numero-referencia': 18,
        'contratante': 25,
        'servico': 35,
        'status': 18,
        'data-limite': 15,
        'cliente': 25,
        'cnpj--cpf': 20,
        'cidade': 18,
        'tecnico': 25,
        'prestador': 25,
        'justificativa-do-abono': 35,
      };
      return { wch: widthMap[colName] || 20 }; // Largura padrão de 20 se não mapeado
    });
    ws['!cols'] = wscols;

    // Estilo para cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro (FF para opacidade total)
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    // Aplicar estilo aos cabeçalhos
    defaultTableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: header }; // Garante que a célula existe
      ws[cellAddress].s = headerStyle;
    });

    // Aplicar estilos às células de dados
    dataToExport.forEach((row, rowIndex) => {
      const currentRowIndex = rowIndex + 1; // +1 porque a linha 0 é o cabeçalho

      const isRowOverdue = isOverdue(row);
      const isRowDueToday = isDueToday(row);

      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (isRowOverdue) {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (isRowDueToday) {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      }

      defaultTableHeaders.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: currentRowIndex, c: colIndex });
        const cellValue = row[header];

        if (!ws[cellAddress]) ws[cellAddress] = {}; // Garante que a célula existe

        // Estilo base da célula (cor da linha)
        const baseCellStyle = {
          fill: { fgColor: { rgb: rowBgColor } },
          font: { color: { rgb: rowTextColor } },
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          },
        };

        // Formatação específica para Data Limite
        if (header === 'Data Limite' && cellValue) {
          const dateObj = parseDateForComparison(cellValue);
          if (dateObj && !isNaN(dateObj.getTime())) {
            ws[cellAddress].t = 'd'; // Tipo data
            ws[cellAddress].v = dateObj; // Valor como objeto Date
            ws[cellAddress].z = 'dd/mm/yyyy'; // Formato de exibição
          } else {
            ws[cellAddress].t = 's'; // Tipo string se não for data válida
            ws[cellAddress].v = cellValue;
          }
        }
        // Formatação específica para CNPJ / CPF
        else if (header === 'CNPJ / CPF' && cellValue) {
          ws[cellAddress].t = 's'; // Força como texto
          ws[cellAddress].v = `'${cellValue}`; // Adiciona apóstrofo para garantir que seja tratado como texto
        }
        // Valor padrão para outras células
        else {
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].v = cellValue;
        }

        // Aplica o estilo base da linha
        ws[cellAddress].s = { ...baseCellStyle };

        // Estilo especial para "FALTA ABONAR" (sobrescreve o estilo de linha)
        if (header === 'Justificativa do Abono') {
          const justificativa = normalizeForComparison(row['Justificativa do Abono']);
          const isAbonarCondition = isOverdue(row) && (justificativa === 'falta abonar' || justificativa === '');

          if (isAbonarCondition) {
            ws[cellAddress].s = {
              ...baseCellStyle, // Mantém bordas e alinhamento
              fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
              font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
            };
            ws[cellAddress].v = 'FALTA ABONAR'; // Define o texto
            ws[cellAddress].t = 's'; // Garante que é texto
          }
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');
    XLSX.writeFile(wb, `Pendencias_${todayFormatted}.xlsx`);
  }, [data, defaultTableHeaders, isOverdue, isDueToday, parseDateForComparison, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
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
                    <th key={header} className={`col-${header.replace(/ /g, '-').replace(/\//g, '-').toLowerCase()}`}>
                      <div className="th-content">
                        <span className="header-text" onClick={() => handleSort(header)}>
                          {header}
                          <FontAwesomeIcon
                            icon={sortColumn === header ? (sortDirection === 'asc' ? faSortUp : faSortDown) : faSort}
                            className={`sort-icon ${sortColumn !== header ? 'inactive' : ''}`}
                          />
                        </span>
                        {filterOptions[header] && filterOptions[header].length > 0 && (
                          <div className="filter-icon-container">
                            <FontAwesomeIcon
                              icon={faFilter}
                              className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                              onClick={() => toggleFilterDropdown(header)}
                            />
                            {activeFilterColumn === header && (
                              <div className="filter-dropdown" ref={filterDropdownRef}>
                                <div className="filter-options-container">
                                  {filterOptions[header].map(option => (
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
                                  <button onClick={applyFilters}>Aplicar</button>
                                  <button onClick={() => clearFilter(header)}>Limpar</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
