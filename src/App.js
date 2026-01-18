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
    if (typeof str !== 'string' && str !== null) return str; // Mantém nulls e não-strings
    if (str === null) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Formata a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta parsear a data no formato DD/MM/YYYY ou YYYY-MM-DD
      const parts = dateString.split(/[\/\- :T]/); // Divide por /, -, espaço ou T
      let date;

      if (parts.length >= 3) {
        // Se for DD/MM/YYYY
        if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length >= 4) {
          date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
        }
        // Se for YYYY-MM-DD
        else if (parts[0].length >= 4 && parts[1].length === 2 && parts[2].length === 2) {
          date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
        }
      }

      if (date && !isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna original se não conseguir formatar
  }, []);

  // Parseia a data para comparação (objeto Date)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      // Tenta parsear a data no formato DD/MM/YYYY ou YYYY-MM-DD
      const parts = dateString.split(/[\/\- :T]/); // Divide por /, -, espaço ou T
      let date;

      if (parts.length >= 3) {
        // Se for DD/MM/YYYY
        if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length >= 4) {
          date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
        }
        // Se for YYYY-MM-DD
        else if (parts[0].length >= 4 && parts[1].length === 2 && parts[2].length === 2) {
          date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
        }
      }

      if (date && !isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      console.error("Erro ao parsear data para comparação:", dateString, e);
    }
    return null;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return dataLimite < today;
  }, [parseDateForComparison]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Retorna a classe CSS para a linha da tabela
  const getRowClass = useCallback((row) => {
    const isOverdueRow = isOverdue(row);
    const isDueTodayRow = isDueToday(row);

    if (isOverdueRow) {
      return 'row-overdue';
    } else if (isDueTodayRow) {
      return 'row-due-today';
    }
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);

  // Retorna o texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const status = normalizeForComparison(row['Status']);
    const isOverdueRow = isOverdue(row);

    // Se a OS está atrasada E a justificativa está vazia ou é "FALTA ABONAR"
    if (isOverdueRow && (justificativa === '' || justificativa === 'falta abonar')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [normalizeForComparison, isOverdue]);

  // Retorna o estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const status = normalizeForComparison(row['Status']);
    const isOverdueRow = isOverdue(row);

    // Se a OS está atrasada E a justificativa está vazia ou é "FALTA ABONAR"
    if (isOverdueRow && (justificativa === '' || justificativa === 'falta abonar')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [normalizeForComparison, isOverdue]);


  // Função para buscar dados iniciais (se houver um endpoint GET)
  // eslint-disable-next-line no-unused-vars
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/data`); // Supondo um endpoint /data
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      setTableHeaders(defaultTableHeaders); // Define os cabeçalhos padrão
    } catch (e) {
      console.error("Erro ao buscar dados iniciais:", e);
      setError('Erro ao carregar dados iniciais.');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, defaultTableHeaders]);

  // Efeito para carregar dados iniciais ou definir cabeçalhos se não houver dados
  useEffect(() => {
    // Se não houver dados e não estiver carregando, define os cabeçalhos padrão
    if (data.length === 0 && !loading) {
      setTableHeaders(defaultTableHeaders);
    }
    // Se você tiver um endpoint GET para dados iniciais, descomente a linha abaixo:
    // fetchInitialData();
  }, [data.length, loading, defaultTableHeaders]); // Adicionado defaultTableHeaders como dependência

  // Efeito para fechar o dropdown de filtro ao clicar fora
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
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.length === 0) {
        setError('Nenhum dado válido foi extraído do arquivo CSV. Verifique o formato.');
        setData([]);
        setTableHeaders(defaultTableHeaders);
      } else {
        setData(result);
        // Garante que os cabeçalhos da tabela sejam os definidos, na ordem correta
        setTableHeaders(defaultTableHeaders);

        // Extrai opções de filtro únicas para cada coluna
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          if (header !== 'Data Limite' && header !== 'CNPJ / CPF') { // Exclui colunas que não precisam de filtro de texto
            newFilterOptions[header] = Array.from(new Set(result.map(row => row[header]))).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
          }
        });
        setFilterOptions(newFilterOptions);
      }
    } catch (e) {
      console.error("Erro ao fazer upload:", e);
      setError(`Erro ao processar o arquivo: ${e.message}`);
      setData([]);
      setTableHeaders(defaultTableHeaders);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleFilterChange = (column, option) => {
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
  };

  const applyColumnFilter = (column) => {
    // A lógica de filtro é aplicada no filteredData, então apenas fechamos o dropdown
    setActiveFilterColumn(null);
  };

  const clearColumnFilter = (column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: [] // Limpa todas as opções selecionadas para a coluna
    }));
    setActiveFilterColumn(null);
  };

  const filteredData = useMemo(() => {
    let filtered = data;

    // Aplica filtro de texto global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    filtered = filtered.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        }
        const normalizedRowValue = normalizeForComparison(row[column]);
        return selectedOptions.some(option => normalizeForComparison(option) === normalizedRowValue);
      });
    });

    return filtered;
  }, [data, searchTerm, selectedFilterOptions, normalizeForComparison]);

  const sortedData = useMemo(() => {
    if (!sortColumn || filteredData.length === 0) {
      return filteredData;
    }

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para "Data Limite"
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Lógica de ordenação para outras colunas (texto ou número)
      const normalizedA = normalizeForComparison(aValue);
      const normalizedB = normalizeForComparison(bValue);

      if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
      if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Contagem de pendências para o botão de exportação
  const overdueAndDueTodayCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Data formatada para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Função para exportar dados para Excel
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    if (data.length === 0) {
      setError('Não há dados para exportar.');
      return;
    }

    // Filtra apenas as OSs atrasadas ou vencendo hoje
    const dataToExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      setError('Não há OSs pendentes (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: defaultTableHeaders });

    // --- Aplicar estilos aos cabeçalhos ---
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    defaultTableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: header };
      ws[cellAddress].s = headerStyle;
    });

    // --- Aplicar estilos às células de dados ---
    for (let R = 0; R < dataToExport.length; ++R) {
      const row = dataToExport[R];
      const rowClass = getRowClass(row); // Obtém a classe da linha para determinar a cor base

      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (rowClass === 'row-overdue') {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      }

      defaultTableHeaders.forEach((header, C) => {
        const cellAddress = XLSX.utils.encode_cell({ r: R + 1, c: C }); // +1 para pular o cabeçalho
        const cellValue = row[header];

        if (!ws[cellAddress]) ws[cellAddress] = { v: '' }; // Garante que a célula exista

        let cellStyle = {
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

        // Estilo específico para "FALTA ABONAR"
        if (header === 'Justificativa do Abono') {
          const justificativaText = getJustificativaCellText(row); // Pega o texto formatado
          if (justificativaText === 'FALTA ABONAR') {
            cellStyle.fill.fgColor.rgb = "FF800080"; // Roxo intenso
            cellStyle.font.color.rgb = "FFFFFFFF"; // Branco
            cellStyle.font.bold = true;
            ws[cellAddress].v = justificativaText; // Garante que o texto seja "FALTA ABONAR"
          } else {
            ws[cellAddress].v = cellValue; // Usa o valor original se não for "FALTA ABONAR"
          }
        } else if (header === 'Data Limite') {
          // Formata a data para o Excel como texto DD/MM/YYYY
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].v = formatDataLimite(cellValue);
        } else if (header === 'CNPJ / CPF') {
          // Garante que CNPJ/CPF seja tratado como texto para preservar zeros à esquerda
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].v = cellValue;
        } else {
          ws[cellAddress].v = cellValue;
        }

        ws[cellAddress].s = cellStyle;
      });
    }

    // --- Definir larguras das colunas ---
    const wscols = defaultTableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      if (header === 'Justificativa do Abono') width = 40;
      if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      if (header === 'CNPJ / CPF') width = 20;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [data, defaultTableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellText, formatDataLimite, todayFormatted]);


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
            <button
              onClick={exportToExcel}
              disabled={data.length === 0 || overdueAndDueTodayCount === 0}
              className="export-button"
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje ({overdueAndDueTodayCount})
            </button>
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
      </header>

      <main className="App-main">
        {loading && <p>Carregando dados...</p>}
        {!loading && data.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map(header => (
                    <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="th-content">
                        <span className="header-text" onClick={() => handleSort(header)}>
                          {header}
                          {sortColumn === header ? (
                            <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                          )}
                        </span>
                        {(header !== 'Data Limite' && header !== 'CNPJ / CPF') && (
                          <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                            <FontAwesomeIcon
                              icon={faFilter}
                              className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation(); // Evita que o clique no ícone feche o dropdown imediatamente
                                setActiveFilterColumn(activeFilterColumn === header ? null : header);
                              }}
                            />
                            {activeFilterColumn === header && (
                              <div className="filter-dropdown">
                                <div className="filter-options-container">
                                  {filterOptions[header] && filterOptions[header].map(option => (
                                    <label key={option} className="filter-option">
                                      <input
                                        type="checkbox"
                                        checked={selectedFilterOptions[header]?.includes(option) || false}
                                        onChange={() => handleFilterChange(header, option)}
                                      />
                                      {option}
                                    </label>
                                  ))}
                                </div>
                                <div className="filter-actions">
                                  <button onClick={() => applyColumnFilter(header)}>Aplicar</button>
                                  <button onClick={() => clearColumnFilter(header)}>Limpar</button>
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
                    {tableHeaders.map(header => (
                      <td
                        key={header}
                        className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
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
        {!loading && data.length === 0 && !error && (
          <p>Faça o upload de um arquivo CSV para visualizar os dados.</p>
        )}
      </main>
    </div>
  );
}

export default App;
