import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// CORREÇÃO: Importa ícones específicos de FontAwesome, não react-icons/fa
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import * as XLSX from 'xlsx';
import './App.css';

function App() {
  const [file, setFile] = useState(null); // CORREÇÃO: Declarado no escopo do componente
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' para mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState({}); // { 'Status': ['Aberto', 'Pendente'], 'Cliente': ['Cliente A'] }
  const [filterOptions, setFilterOptions] = useState({}); // Opções disponíveis para cada filtro
  const [activeFilterColumn, setActiveFilterColumn] = useState(null); // Coluna cujo dropdown de filtro está aberto
  const fileInputRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

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

  // CORREÇÃO: setTableHeaders agora é um useState, não precisa ser definido aqui
  const [tableHeaders, setTableHeaders] = useState(defaultTableHeaders);

  // eslint-disable-next-line no-unused-vars
  const fetchInitialData = useCallback(async () => {
    // Esta função não é usada porque não temos um endpoint GET para dados iniciais.
    // O carregamento de dados é feito via upload de CSV.
    // Se um dia houver um endpoint GET para carregar dados ao iniciar, este é o lugar.
  }, []);

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
      // Remove a parte da hora se existir e tenta parsear DD/MM/YYYY
      const datePart = String(dateString).split(' ')[0];
      const parts = datePart.split('/');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        if (!isNaN(date.getTime())) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        }
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
      const datePart = String(dateString).split(' ')[0];
      const parts = datePart.split('/');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
        return isNaN(date.getTime()) ? null : date;
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
    today.setHours(0, 0, 0, 0);
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
    const justificativa = String(row['Justificativa do Abono'] || '').toUpperCase().trim();
    const isOverdueRow = isOverdue(row);

    // Se a OS está atrasada E a justificativa está vazia ou é "FALTA ABONAR"
    if (isOverdueRow && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue]);

  // Retorna o estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').toUpperCase().trim();
    const isOverdueRow = isOverdue(row);

    // Se a OS está atrasada E a justificativa está vazia ou é "FALTA ABONAR"
    if (isOverdueRow && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso, texto branco
    }
    return {};
  }, [isOverdue]);


  // Efeito para carregar dados iniciais ou definir cabeçalhos se não houver dados
  useEffect(() => {
    // Se não houver dados e não estiver carregando, define os cabeçalhos padrão
    if (data.length === 0 && !loading) {
      setTableHeaders(defaultTableHeaders);
    }
    // Se você tiver um endpoint GET para dados iniciais, descomente a linha abaixo:
    // fetchInitialData();
  }, [data.length, loading, defaultTableHeaders]); // Adicionado defaultTableHeaders como dependência

  // Lida com o upload do arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]); // CORREÇÃO: setFile agora está no escopo
    setError('');
  };

  const handleProcessCsv = async () => {
    if (!file) { // CORREÇÃO: 'file' agora está no escopo
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError(null); // Limpa erros anteriores
    setData([]); // Limpa dados anteriores
    setFilteredData([]); // Limpa dados filtrados anteriores
    setColumnFilters({}); // Limpa filtros de coluna
    setSearchTerm(''); // Limpa termo de busca
    setSortColumn('Data Limite'); // Reseta ordenação
    setSortDirection('asc');

    const formData = new FormData();
    formData.append('file', file); // CORREÇÃO: 'file' agora está no escopo

    try {
      // CORREÇÃO: Endpoint de upload alterado para '/upload'
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro no servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.length === 0) {
        setError('Nenhum dado válido foi extraído do arquivo CSV. Verifique o formato.');
        setData([]);
        setTableHeaders(defaultTableHeaders); // CORREÇÃO: 'defaultTableHeaders' no escopo
      } else {
        // Processa os dados para garantir que 'CNPJ / CPF' seja string
        const processedData = result.map(row => {
          const newRow = { ...row };
          if (newRow['CNPJ / CPF']) {
            newRow['CNPJ / CPF'] = String(newRow['CNPJ / CPF']).trim();
          }
          return newRow;
        });

        setData(processedData);
        setTableHeaders(defaultTableHeaders); // CORREÇÃO: 'defaultTableHeaders' no escopo

        // Extrai opções de filtro únicas para cada coluna
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => { // CORREÇÃO: 'defaultTableHeaders' no escopo
          const uniqueValues = [...new Set(processedData.map(row => row[header]))]
            .filter(Boolean) // Remove valores vazios/nulos
            .sort((a, b) => String(a).localeCompare(String(b))); // Ordena alfabeticamente
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);
        setColumnFilters(newFilterOptions); // Inicializa os filtros de coluna com todas as opções

        // Aplica a filtragem inicial (status permitidos) e ordenação
        // Isso será feito no useEffect de filtragem/ordenação
      }
    } catch (e) {
      console.error("Erro ao fazer upload:", e);
      setError(`Erro ao processar o arquivo: ${e.message}. Verifique o formato do CSV (separador ';') e a codificação (latin1).`);
      setData([]);
      setTableHeaders(defaultTableHeaders); // CORREÇÃO: 'defaultTableHeaders' no escopo
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Limpa o input file para permitir novo upload do mesmo arquivo
      }
    }
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleFilterDropdown = (column) => {
    setActiveFilterColumn(activeFilterColumn === column ? null : column);
  };

  const handleFilterChange = useCallback((column, option, isChecked) => {
    setColumnFilters(prevFilters => {
      const currentFilters = prevFilters[column] || [];
      if (isChecked) {
        return { ...prevFilters, [column]: [...currentFilters, option] };
      } else {
        return { ...prevFilters, [column]: currentFilters.filter(item => item !== option) };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((column) => {
    setColumnFilters(prevFilters => {
      const newFilters = { ...prevFilters };
      delete newFilters[column]; // Remove todos os filtros para a coluna
      return newFilters;
    });
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  const filterDropdownRef = useRef(null);
  const filterIconRef = useRef(null); // Ref para o ícone de filtro

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeFilterColumn && filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
        filterIconRef.current && !filterIconRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeFilterColumn]);


  // Lógica de filtragem e ordenação principal
  useEffect(() => {
    let currentFilteredData = data;

    // 1. Filtragem por status (apenas os 5 desejados)
    const allowedStatuses = ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO'];
    currentFilteredData = currentFilteredData.filter(row =>
      allowedStatuses.includes(String(row['Status'] || '').toUpperCase().trim())
    );

    // 2. Filtragem por termo de pesquisa (global)
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentFilteredData = currentFilteredData.filter(row =>
        defaultTableHeaders.some(header => // Usa defaultTableHeaders para iterar sobre as colunas
          String(row[header] || '').toLowerCase().includes(lowerCaseSearchTerm)
        )
      );
    }

    // 3. Filtragem por coluna (filtros de dropdown)
    currentFilteredData = currentFilteredData.filter(row => {
      return Object.keys(columnFilters).every(column => {
        const filters = columnFilters[column];
        if (filters.length === 0) return true; // Se não há filtros para a coluna, todos passam
        return filters.includes(row[column]);
      });
    });

    // 4. Ordenação
    const sorted = [...currentFilteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Lógica de ordenação para outras colunas (string ou numérica)
      const normalizedA = normalizeForComparison(aValue);
      const normalizedB = normalizeForComparison(bValue);

      if (normalizedA < normalizedB) {
        return sortDirection === 'asc' ? -1 : 1;
      } else if (normalizedA > normalizedB) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    setFilteredData(sorted);
  }, [data, searchTerm, columnFilters, sortColumn, sortDirection, defaultTableHeaders, normalizeForComparison, parseDateForComparison]);


  // Calcula a contagem de pendências para o botão de exportação
  const overdueAndDueTodayCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Data formatada para o nome do arquivo Excel
  const todayFormatted = useMemo(() => { // CORREÇÃO: todayFormatted agora está no escopo
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Janeiro é 0!
    const yyyy = today.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }, []);


  // Função para exportar para Excel com estilos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    if (data.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Filtra apenas os itens atrasados e vencendo hoje
    const dataToExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]); // Cria uma planilha vazia

    // 1. Adiciona os cabeçalhos com estilos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro (#2C3E50)
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    XLSX.utils.sheet_add_aoa(ws, [defaultTableHeaders], { origin: "A1" }); // Usa defaultTableHeaders para a ordem

    // Aplica o estilo aos cabeçalhos
    defaultTableHeaders.forEach((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = headerStyle;
    });

    // 2. Adiciona os dados com estilos de linha e célula
    dataToExport.forEach((row, rowIndex) => {
      const displayRowIndex = rowIndex + 1; // +1 para compensar o cabeçalho
      const rowClass = getRowClass(row); // Obtém a classe CSS da linha

      let baseBgColor = "FFE0F2F7"; // Azul claro padrão (row-default-blue)
      let baseTextColor = "FF000000"; // Preto padrão

      if (rowClass === 'row-overdue') {
        baseBgColor = "FFC00000"; // Vermelho intenso
        baseTextColor = "FFFFFFFF"; // Branco
      } else if (rowClass === 'row-due-today') {
        baseBgColor = "FFFFC000"; // Amarelo
        baseTextColor = "FF000000"; // Preto
      }

      defaultTableHeaders.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: displayRowIndex, c: colIndex });
        if (!ws[cellAddress]) ws[cellAddress] = {};

        let cellValue = row[header];

        const cellStyle = {
          fill: { fgColor: { rgb: baseBgColor } },
          font: { color: { rgb: baseTextColor } },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          },
          alignment: { vertical: "center" },
        };

        // Estilo específico para "FALTA ABONAR"
        if (header === 'Justificativa do Abono') {
          const justificativaText = getJustificativaCellText(row); // Pega o texto formatado
          if (justificativaText === 'FALTA ABONAR') {
            cellStyle.fill.fgColor.rgb = "FF800080"; // Roxo intenso
            cellStyle.font.color.rgb = "FFFFFFFF"; // Branco
            cellStyle.font.bold = true;
            ws[cellAddress].v = justificativaText; // Garante que o texto seja "FALTA ABONAR"
            ws[cellAddress].t = 's'; // Garante que é texto
          } else {
            ws[cellAddress].v = cellValue; // Usa o valor original se não for "FALTA ABONAR"
            ws[cellAddress].t = 's';
          }
        } else if (header === 'Data Limite') {
          // Formata a data para o Excel como texto DD/MM/YYYY
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].v = formatDataLimite(cellValue);
        } else if (header === 'CNPJ / CPF') {
          // Garante que CNPJ/CPF seja tratado como texto para preservar zeros à esquerda
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].v = `'${cellValue}`; // Adiciona apóstrofo para forçar texto no Excel
        } else {
          ws[cellAddress].v = cellValue;
          ws[cellAddress].t = 's'; // Default para string
        }

        ws[cellAddress].s = cellStyle;
      });
    });

    // 3. Definir larguras das colunas
    const wscols = defaultTableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Chamado') width = 12;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Contratante') width = 25;
      else if (header === 'Serviço') width = 35;
      else if (header === 'Status') width = 18;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Cliente') width = 25;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Cidade') width = 18;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Prestador') width = 25;
      else if (header === 'Justificativa do Abono') width = 40;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [data, defaultTableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellStyle, getJustificativaCellText, formatDataLimite, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Escolher CSV
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              ref={fileInputRef}
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
                placeholder="Pesquisar em toda a tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button
              onClick={exportToExcel}
              className="export-button"
              disabled={overdueAndDueTodayCount === 0}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje ({overdueAndDueTodayCount})
            </button>
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
      </header>

      <main className="App-main">
        {!loading && data.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {defaultTableHeaders.map((header) => ( // Usa defaultTableHeaders para a ordem
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
                        {/* Filtro de coluna apenas para colunas que fazem sentido */}
                        {['Status', 'Contratante', 'Serviço', 'Cliente', 'Cidade', 'Técnico', 'Prestador', 'Justificativa do Abono'].includes(header) && (
                          <div className="filter-icon-container">
                            <FontAwesomeIcon
                              icon={faFilter}
                              className={`filter-icon ${activeFilterColumn === header || (columnFilters[header] && columnFilters[header].length > 0) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation(); // Evita que o clique no ícone de filtro ordene a coluna
                                toggleFilterDropdown(header);
                              }}
                            />
                            {activeFilterColumn === header && (
                              <div className="filter-dropdown" ref={filterDropdownRef} onClick={(e) => e.stopPropagation()}>
                                <div className="filter-options-container">
                                  {filterOptions[header] && filterOptions[header].map(option => (
                                    <label key={option} className="filter-option">
                                      <input
                                        type="checkbox"
                                        checked={(columnFilters[header] || []).includes(option)}
                                        onChange={(e) => handleFilterChange(header, option, e.target.checked)}
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
                {filteredData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {defaultTableHeaders.map((header) => ( // Usa defaultTableHeaders para a ordem
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
