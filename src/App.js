import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' para mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState({}); // { 'Status': ['Aberto', 'Pendente'], 'Cliente': ['Cliente A'] }
  const [activeFilterColumn, setActiveFilterColumn] = useState(null); // Coluna cujo dropdown de filtro está aberto
  const fileInputRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // eslint-disable-next-line no-unused-vars
  const fetchInitialData = useCallback(async () => {
    // Esta função não é usada porque não temos um endpoint GET para dados iniciais.
    // O carregamento de dados é feito via upload de CSV.
    // Se um dia houver um endpoint GET para carregar dados ao iniciar, este é o lugar.
  }, []);

  // useEffect(() => {
  //   fetchInitialData(); // Comentado pois não há endpoint GET inicial
  // }, [fetchInitialData]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Por favor, selecione um arquivo para upload.');
      return;
    }

    setLoading(true);
    setError(null);
    setData([]); // Limpa dados anteriores
    setFilteredData([]); // Limpa dados filtrados anteriores
    setColumnFilters({}); // Limpa filtros de coluna

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload-csv`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro no servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Processa os dados para garantir que 'Data Limite' seja um objeto Date e 'CNPJ / CPF' seja string
      const processedData = result.map(row => {
        const newRow = { ...row };
        // Formata 'Data Limite' para exibição e para comparação
        if (newRow['Data Limite']) {
          const [day, month, year] = newRow['Data Limite'].split('/');
          // Cria um objeto Date no fuso horário local para evitar problemas de fuso horário
          newRow._dataLimiteDate = new Date(year, month - 1, day);
          newRow['Data Limite'] = `${day}/${month}/${year}`; // Mantém formato DD/MM/YYYY para exibição
        } else {
          newRow._dataLimiteDate = null;
        }

        // Garante que 'CNPJ / CPF' seja tratado como string para evitar problemas de formatação numérica
        if (newRow['CNPJ / CPF']) {
          newRow['CNPJ / CPF'] = String(newRow['CNPJ / CPF']).trim();
        }

        return newRow;
      });

      setData(processedData);
      setFilteredData(processedData); // Inicialmente, dados filtrados são todos os dados
      setSortColumn('Data Limite'); // Define a coluna de ordenação inicial
      setSortDirection('asc'); // Define a direção de ordenação inicial (mais antigo para mais recente)

    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError(`Falha ao processar o arquivo: ${err.message}. Verifique o formato do CSV (separador ';') e a codificação (latin1).`);
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

  const handleFilterChange = useCallback((column, value, isChecked) => {
    setColumnFilters(prevFilters => {
      const currentFilters = prevFilters[column] || [];
      if (isChecked) {
        return { ...prevFilters, [column]: [...currentFilters, value] };
      } else {
        return { ...prevFilters, [column]: currentFilters.filter(item => item !== value) };
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

  // Memoiza os cabeçalhos da tabela
  const headers = useMemo(() => {
    if (data.length === 0) return [];
    // Filtra '_dataLimiteDate' que é uma prop interna
    return Object.keys(data[0]).filter(key => key !== '_dataLimiteDate');
  }, [data]);

  // Função para parsear datas para comparação, garantindo consistência
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/');
    return new Date(year, month - 1, day); // Cria data no fuso horário local
  }, []);

  // Funções para determinar status de atraso/vencimento
  const isOverdue = useCallback((row) => {
    if (!row._dataLimiteDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return row._dataLimiteDate < today;
  }, []);

  const isDueToday = useCallback((row) => {
    if (!row._dataLimiteDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return row._dataLimiteDate.getTime() === today.getTime();
  }, []);

  // Lógica de filtragem e ordenação principal
  useEffect(() => {
    let currentFilteredData = data;

    // 1. Filtragem por status (apenas os 5 desejados)
    const allowedStatuses = ['ABERTO', 'PENDENTE', 'AGUARDANDO PEÇAS', 'AGUARDANDO APROVAÇÃO', 'AGUARDANDO RETORNO'];
    currentFilteredData = currentFilteredData.filter(row =>
      allowedStatuses.includes(row['Status']?.toUpperCase())
    );

    // 2. Filtragem por termo de pesquisa (global)
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentFilteredData = currentFilteredData.filter(row =>
        headers.some(header =>
          String(row[header]).toLowerCase().includes(lowerCaseSearchTerm)
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
    const sortedData = [...currentFilteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = a._dataLimiteDate;
        const dateB = b._dataLimiteDate;

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Lógica de ordenação para outras colunas (string ou numérica)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      // Fallback para tipos mistos ou nulos
      return 0;
    });

    setFilteredData(sortedData);
  }, [data, searchTerm, columnFilters, sortColumn, sortDirection, headers, parseDateForComparison]);


  // Calcula a contagem de pendências para o botão de exportação
  const overdueAndDueTodayCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Formata a data atual para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Janeiro é 0!
    const yyyy = today.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }, []);


  // Funções para estilos de célula e linha
  const getRowClass = useCallback((row) => {
    // eslint-disable-next-line no-unused-vars
    const isAbonar = isOverdue(row) && (row['Justificativa do Abono'] === 'FALTA ABONAR' || row['Justificativa do Abono'] === '');

    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasadas
    } else if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para as demais
  }, [isOverdue, isDueToday]);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono']).toUpperCase().trim();
    if (isOverdue(row) && (justificativa === 'FALTA ABONAR' || justificativa === '')) {
      return { backgroundColor: '#800080', color: 'white', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono']).toUpperCase().trim();
    if (isOverdue(row) && (justificativa === 'FALTA ABONAR' || justificativa === '')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue]);


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

    const ws_data = [];

    // 1. Cabeçalhos
    const headerRow = headers.map(h => h); // Usa os cabeçalhos do estado
    ws_data.push(headerRow);

    // 2. Dados das linhas
    dataToExport.forEach(row => {
      const excelRow = headers.map(header => {
        if (header === 'Data Limite') {
          // Garante que a data seja exportada como string DD/MM/YYYY
          return row[header];
        }
        if (header === 'CNPJ / CPF') {
          // Garante que CNPJ/CPF seja tratado como texto no Excel
          return String(row[header]);
        }
        return row[header];
      });
      ws_data.push(excelRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Definir larguras das colunas
    const wscols = headers.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 18; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 18; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 40; break;
        default: width = 15; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
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

    // Aplicar estilos aos cabeçalhos
    headers.forEach((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = headerStyle;
    });

    // Aplicar estilos às células de dados
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

      headers.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: displayRowIndex, c: colIndex });
        if (!ws[cellAddress]) ws[cellAddress] = {};

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
          const justificativaStyle = getJustificativaCellStyle(row);
          if (Object.keys(justificativaStyle).length > 0) {
            cellStyle.fill.fgColor.rgb = "FF800080"; // Roxo intenso
            cellStyle.font.color.rgb = "FFFFFFFF"; // Branco
            cellStyle.font.bold = true;
            ws[cellAddress].v = getJustificativaCellText(row); // Garante o texto "FALTA ABONAR"
          }
        }

        // Formatação específica para Data Limite
        if (header === 'Data Limite' && row[header]) {
          cellStyle.numFmt = 'DD/MM/YYYY';
          // O valor já é uma string DD/MM/YYYY, então o XLSX.utils.format_cell vai lidar com isso
          // ou podemos definir o tipo como string explicitamente se houver problemas
          ws[cellAddress].t = 's'; // Força tipo string para evitar que o Excel tente converter para data
        }

        // Formatação específica para CNPJ / CPF
        if (header === 'CNPJ / CPF' && row[header]) {
          ws[cellAddress].t = 's'; // Força tipo string para evitar que o Excel tente converter para número
        }

        ws[cellAddress].s = cellStyle;
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias Hoje");
    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [data, headers, isOverdue, isDueToday, getRowClass, getJustificativaCellStyle, getJustificativaCellText, todayFormatted]);


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
              onChange={handleFileUpload}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            {loading && <p>Processando...</p>}
            {error && <p className="error-message">{error}</p>}
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
      </header>

      <main className="App-main">
        {data.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {headers.map((header) => (
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
                        <div className="filter-icon-container">
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation(); // Evita que o clique no ícone de filtro ordene a coluna
                              toggleFilterDropdown(header);
                            }}
                          />
                          {activeFilterColumn === header && (
                            <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                              <div className="filter-options-container">
                                {Array.from(new Set(data.map(row => row[header])))
                                  .filter(Boolean) // Remove valores vazios/nulos
                                  .sort((a, b) => String(a).localeCompare(String(b))) // Ordena alfabeticamente
                                  .map(option => (
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
                {filteredData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {headers.map((header) => (
                      <td
                        key={header}
                        className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                        style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                      >
                        {header === 'Justificativa do Abono'
                          ? getJustificativaCellText(row)
                          : row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
