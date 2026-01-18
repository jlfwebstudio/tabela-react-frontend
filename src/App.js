// frontend/src/App.js
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { format, parseISO, isBefore, isToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FaSort, FaSortUp, FaSortDown, FaFilter, FaSearch, FaUpload, FaFileExcel } from 'react-icons/fa';
import './App.css';

// URL do seu backend no Render
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://tabela-api-backend.onrender.com';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null); // Estado para o arquivo selecionado
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' ou 'desc'
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(null); // Coluna do filtro aberto
  const [columnFilters, setColumnFilters] = useState({}); // { 'Status': ['Pendente', 'Em Andamento'] }

  // Define os cabeçalhos padrão da tabela
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

  const [tableHeaders, setTableHeaders] = useState(defaultTableHeaders);

  // Formata a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta analisar como ISO 8601 primeiro (comum em JSON)
      let date = parseISO(dateString);
      if (isNaN(date.getTime())) {
        // Se falhar, tenta analisar como DD/MM/YYYY ou MM/DD/YYYY
        const parts = dateString.split(/[\/\-]/); // Divide por / ou -
        if (parts.length === 3) {
          // Assume DD/MM/YYYY se o dia for <= 31 e mês <= 12
          // Ou MM/DD/YYYY se o dia for > 12 e mês <= 12
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);

          if (day <= 31 && month <= 12 && day > 0 && month > 0) {
            // Tentativa de DD/MM/YYYY
            date = new Date(year, month - 1, day);
            if (isNaN(date.getTime())) {
              // Tentativa de MM/DD/YYYY
              date = new Date(year, day - 1, month);
            }
          }
        }
      }
      if (isNaN(date.getTime())) {
        return dateString; // Retorna a string original se não conseguir formatar
      }
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
      return dateString;
    }
  }, []);

  // Analisa a data para comparação (útil para ordenação e filtros)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      let date = parseISO(dateString);
      if (isNaN(date.getTime())) {
        const parts = dateString.split(/[\/\-]/);
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          if (day <= 31 && month <= 12 && day > 0 && month > 0) {
            date = new Date(year, month - 1, day);
            if (isNaN(date.getTime())) {
              date = new Date(year, day - 1, month);
            }
          }
        }
      }
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }, []);

  // Efeito para carregar dados iniciais (se houver um endpoint GET)
  useEffect(() => {
    // eslint-disable-next-line no-unused-vars
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        // Se você tiver um endpoint GET para carregar dados iniciais, descomente e ajuste aqui
        // const response = await fetch(`${API_BASE_URL}/data`);
        // if (!response.ok) {
        //   throw new Error(`HTTP error! status: ${response.status}`);
        // }
        // const initialData = await response.json();
        // setData(initialData);
        // setTableHeaders(Object.keys(initialData[0] || defaultTableHeaders));
      } catch (e) {
        setError('Falha ao carregar dados iniciais.');
        console.error('Erro ao carregar dados iniciais:', e);
      } finally {
        setLoading(false);
      }
    };

    // fetchInitialData(); // Chamada comentada, pois não temos um endpoint GET inicial
  }, [defaultTableHeaders]); // Adicionado defaultTableHeaders como dependência

  // Lida com a seleção do arquivo CSV
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError(null); // Limpa erros anteriores
  };

  // Processa o arquivo CSV
  const handleProcessCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError(null);
    setData([]); // Limpa dados anteriores
    setColumnFilters({}); // Limpa filtros de coluna
    setSortColumn('Data Limite'); // Reseta ordenação
    setSortDirection('asc');

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, { // CORRIGIDO: Endpoint para /upload
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        // Define os cabeçalhos da tabela com base nos dados processados, mantendo a ordem esperada
        setTableHeaders(defaultTableHeaders.filter(header => Object.keys(result[0]).includes(header)));
      } else {
        setData([]);
        setError('O arquivo CSV não contém dados válidos ou está vazio.');
      }
    } catch (e) {
      console.error('Erro ao processar o arquivo:', e);
      setError(`Falha ao processar o arquivo: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lógica para determinar a classe da linha (cor de fundo)
  const getRowClass = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas da data

    if (!dataLimite) {
      return 'row-default-blue'; // Se não houver data limite, azul claro
    }

    const isOverdue = isBefore(dataLimite, today);
    const isDueToday = isToday(dataLimite);

    if (isOverdue) {
      return 'row-overdue'; // Vermelho intenso
    } else if (isDueToday) {
      return 'row-due-today'; // Amarelo
    } else {
      return 'row-default-blue'; // Azul claro
    }
  }, [parseDateForComparison]);

  // Lógica para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite && isBefore(dataLimite, today);
    const isAbonar = isOverdue && (justificativa === '' || justificativa.toLowerCase() === 'falta abonar');

    if (isAbonar) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [parseDateForComparison]);

  // Lógica para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    const justificativa = row['Justificativa do Abono'] ? row['Justificativa do Abono'].trim() : '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite && isBefore(dataLimite, today);
    const isAbonar = isOverdue && (justificativa === '' || justificativa.toLowerCase() === 'falta abonar');

    // eslint-disable-next-line no-unused-vars
    const justificativaText = isAbonar ? 'FALTA ABONAR' : justificativa; // Mantido para referência, mas não usado diretamente aqui

    return isAbonar ? 'FALTA ABONAR' : justificativa;
  }, [parseDateForComparison]);


  // Filtra e ordena os dados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtros de coluna
    Object.keys(columnFilters).forEach(column => {
      const selectedFilters = columnFilters[column];
      if (selectedFilters && selectedFilters.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedFilters.includes(String(row[column]))
        );
      }
    });

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      filteredData = filteredData.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(lowerCaseSearchTerm)
        )
      );
    }

    // Aplica ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Para outros tipos de dados, tenta comparação numérica ou string
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }

        const stringA = String(aValue || '').toLowerCase();
        const stringB = String(bValue || '').toLowerCase();

        return sortDirection === 'asc' ? stringA.localeCompare(stringB) : stringB.localeCompare(stringA);
      });
    }

    return filteredData;
  }, [data, searchTerm, sortColumn, sortDirection, columnFilters, parseDateForComparison]);

  // Calcula o número de pendências para o botão "Pendentes Hoje"
  const overdueAndDueTodayCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.filter(row => {
      const dataLimite = parseDateForComparison(row['Data Limite']);
      if (!dataLimite) return false;
      const isOverdue = isBefore(dataLimite, today);
      const isDueToday = isToday(dataLimite);
      return isOverdue || isDueToday;
    }).length;
  }, [data, parseDateForComparison]);


  // Lida com a mudança de ordenação
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão para ascendente ao mudar de coluna
    }
  }, [sortColumn, sortDirection]);

  // Abre/fecha o dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setFilterDropdownOpen(filterDropdownOpen === column ? null : column);
  }, [filterDropdownOpen]);

  // Lida com a seleção de opções de filtro
  const handleFilterChange = useCallback((column, value) => {
    setColumnFilters(prevFilters => {
      const currentFilters = prevFilters[column] || [];
      if (currentFilters.includes(value)) {
        return {
          ...prevFilters,
          [column]: currentFilters.filter(item => item !== value),
        };
      } else {
        return {
          ...prevFilters,
          [column]: [...currentFilters, value],
        };
      }
    });
  }, []);

  // Aplica os filtros de coluna (fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setFilterDropdownOpen(null);
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setColumnFilters(prevFilters => {
      const newFilters = { ...prevFilters };
      delete newFilters[column];
      return newFilters;
    });
    setFilterDropdownOpen(null);
  }, []);

  // Referência para o dropdown de filtro para fechar ao clicar fora
  const filterDropdownRef = useRef(null);
  const filterIconRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target) &&
        filterIconRef.current &&
        !filterIconRef.current.contains(event.target)
      ) {
        setFilterDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Formata a data atual para o nome do arquivo Excel
  const todayFormatted = useMemo(() => format(new Date(), 'dd-MM-yyyy'), []);

  // Função para exportar dados para Excel
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra apenas os itens atrasados ou vencendo hoje
    const dataToExport = data.filter(row => {
      const dataLimite = parseDateForComparison(row['Data Limite']);
      if (!dataLimite) return false;
      const isOverdue = isBefore(dataLimite, today);
      const isDueToday = isToday(dataLimite);
      return isOverdue || isDueToday;
    }).map(row => {
      // Cria uma cópia da linha e formata a Data Limite para o Excel
      const newRow = { ...row };
      newRow['Data Limite'] = formatDataLimite(row['Data Limite']);
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, {
      header: tableHeaders,
      skipHeader: false,
    });

    // --- Aplicar estilos aos cabeçalhos ---
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF336699" } }, // Azul escuro (FF para opacidade total)
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    tableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: header }; // Garante que a célula exista
      ws[cellAddress].s = headerStyle;
    });

    // --- Aplicar estilos às células de dados ---
    dataToExport.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1; // +1 para pular o cabeçalho

      const dataLimite = parseDateForComparison(row['Data Limite']);
      const todayCompare = new Date();
      todayCompare.setHours(0, 0, 0, 0);

      const isOverdue = dataLimite && isBefore(dataLimite, todayCompare);
      const isDueToday = dataLimite && isToday(dataLimite);

      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (isOverdue) {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (isDueToday) {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: excelRowIndex, c: colIndex });
        const cellValue = row[header];

        if (!ws[cellAddress]) ws[cellAddress] = { v: cellValue }; // Garante que a célula exista

        // Estilo base da linha
        ws[cellAddress].s = {
          fill: { fgColor: { rgb: rowBgColor } },
          font: { color: { rgb: rowTextColor } },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          },
        };

        // Tratamento especial para "CNPJ / CPF" (como texto)
        if (header === 'CNPJ / CPF') {
          ws[cellAddress].t = 's'; // Tipo string
          ws[cellAddress].z = '@'; // Formato de texto
        }

        // Tratamento especial para "Data Limite" (como data formatada)
        if (header === 'Data Limite') {
          // O valor já está formatado como string "dd/MM/yyyy"
          ws[cellAddress].t = 's'; // Trata como string para manter o formato exato
          ws[cellAddress].z = 'dd/mm/yyyy'; // Formato de data para Excel, mas o valor é string
        }

        // Estilo para "FALTA ABONAR" (sobrescreve o estilo de linha)
        if (header === 'Justificativa do Abono') {
          const justificativa = String(cellValue || '').trim();
          const isAbonar = isOverdue && (justificativa === '' || justificativa.toLowerCase() === 'falta abonar');

          if (isAbonar) {
            ws[cellAddress].v = 'FALTA ABONAR'; // Garante o texto correto
            ws[cellAddress].s = {
              ...ws[cellAddress].s, // Mantém bordas e alinhamento
              fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
              font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco e negrito
            };
          }
        }
      });
    });

    // --- Ajustar largura das colunas ---
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      if (header === 'Justificativa do Abono') width = 40;
      if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      if (header === 'CNPJ / CPF') width = 20;
      if (header === 'Data Limite') width = 15;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [data, tableHeaders, parseDateForComparison, formatDataLimite, getJustificativaCellStyle]); // Removido getJustificativaCellStyle das dependências, pois não é usado diretamente aqui


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de OSs Pendentes</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="csv-upload" className="custom-file-upload">
              <FaUpload /> Selecionar CSV
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleProcessCsv} className="process-csv-button" disabled={!file || loading}>
              Processar CSV
            </button>
          </div>

          <div className="global-actions-section">
            <div className="search-container">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar em toda a tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FaFileExcel /> Exportar Pendentes Hoje ({overdueAndDueTodayCount})
            </button>
          </div>
        </div>
        {loading && <p>Carregando...</p>}
        {error && <p className="error-message">{error}</p>}
      </header>

      <div className="data-table-container">
        {filteredAndSortedData.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <span className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? <FaSortUp className="sort-icon" /> : <FaSortDown className="sort-icon" />
                        ) : (
                          <FaSort className="sort-icon inactive" />
                        )}
                      </span>
                      <div ref={filterIconRef} className="filter-icon-container">
                        <FaFilter
                          className={`filter-icon ${filterDropdownOpen === header ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Evita que o clique no ícone feche o dropdown imediatamente
                            toggleFilterDropdown(header);
                          }}
                        />
                        {filterDropdownOpen === header && (
                          <div ref={filterDropdownRef} className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {[...new Set(data.map(row => String(row[header])))]
                                .sort((a, b) => a.localeCompare(b))
                                .map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={(columnFilters[header] || []).includes(option)}
                                      onChange={() => handleFilterChange(header, option)}
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
                  {tableHeaders.map((header) => (
                    <td
                      key={`${rowIndex}-${header}`}
                      className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Data Limite'
                        ? formatDataLimite(row[header])
                        : header === 'Justificativa do Abono'
                          ? getJustificativaCellText(row)
                          : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading && !error && <p>Nenhum dado para exibir. Por favor, faça o upload de um arquivo CSV.</p>
        )}
      </div>
    </div>
  );
}

export default App;
