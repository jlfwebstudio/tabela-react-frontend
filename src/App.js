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

  // Retorna a classe CSS para a linha da tabela com base no status da data limite
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

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados anteriores ao iniciar um novo upload

    const formData = new FormData();
    formData.append('file', file); // Usando 'file' como nome do campo, conforme o backend espera

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler a resposta como JSON primeiro
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          // Se não for JSON, lê como texto
          errorData = await response.text();
        }
        throw new Error(`Erro no servidor: ${response.status} - ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}`);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        // Extrai todos os valores únicos para cada cabeçalho para as opções de filtro
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const options = new Set();
          result.forEach(row => {
            if (row[header]) {
              options.add(String(row[header]).trim());
            }
          });
          newFilterOptions[header] = Array.from(options).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
        });
        setFilterOptions(newFilterOptions);
      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
      setFile(null); // Limpa o arquivo selecionado após o upload
    }
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison]);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]); // <--- CORREÇÃO AQUI: 'sortDirection' removido das dependências

  // Lida com a mudança no termo de busca
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a mudança nas opções de filtro
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

  // Aplica os filtros da coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: [] // Define como array vazio para limpar
    }));
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // Alterna a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && activeFilterColumn) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef, activeFilterColumn]); // activeFilterColumn é uma dependência importante aqui

  // Filtra e ordena os dados
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    // 1. Filtrar por termo de busca
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filtered = filtered.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções selecionadas
    filtered = filtered.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        }
        const cellValue = String(row[column] || '').trim();
        return selectedOptions.includes(cellValue);
      });
    });

    // 3. Ordenar
    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA && dateB) {
          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }
        if (dateA) return sortDirection === 'asc' ? -1 : 1; // Datas válidas vêm antes
        if (dateB) return sortDirection === 'asc' ? 1 : -1;
        return 0; // Ambas nulas ou inválidas
      }

      // Lógica de ordenação para outras colunas (strings ou números)
      const normalizedA = normalizeForComparison(aValue);
      const normalizedB = normalizeForComparison(bValue);

      if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
      if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Atualiza o contador de pendências atrasadas
    const overdueCount = sorted.filter(row => isOverdue(row)).length;
    setCurrentOverdueCount(overdueCount);

    return sorted;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison, isOverdue]);

  // Efeito para definir os cabeçalhos da tabela quando os dados são carregados
  useEffect(() => {
    if (data.length > 0) {
      // Usa os cabeçalhos padrão e garante que todos os cabeçalhos dos dados estejam presentes
      const allKeys = new Set();
      data.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)));
      const finalHeaders = defaultTableHeaders.filter(header => allKeys.has(header));
      // Adiciona quaisquer cabeçalhos que existam nos dados mas não nos padrões, no final
      Array.from(allKeys).forEach(key => {
        if (!finalHeaders.includes(key)) {
          finalHeaders.push(key);
        }
      });
      setTableHeaders(finalHeaders);
    } else {
      setTableHeaders(defaultTableHeaders); // Se não há dados, usa os cabeçalhos padrão
    }
  }, [data, defaultTableHeaders]);

  // Função para exportar os dados filtrados e ordenados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as pendências atrasadas ou que vencem hoje
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas ou que vencem hoje para exportar.');
      return;
    }

    // Prepara os dados para a planilha, incluindo os cabeçalhos
    const ws_data = [tableHeaders.map(header => header)]; // Primeira linha são os cabeçalhos
    filteredForExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Data Limite') {
          // Retorna a data como string formatada para o Excel processar como data
          const date = parseDateForComparison(row[header]);
          return date && !isNaN(date) ? date : row[header];
        }
        return row[header];
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // Define as larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 18; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 30; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 30; break;
        default: width = 15; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Aplica estilos às células
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Estilo base para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    // Estilos base para as linhas de dados
    const defaultRowBaseStyle = {
      font: { color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "FFFFFF" } }, // Fundo branco
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "DDDDDD" } },
        bottom: { style: "thin", color: { rgb: "DDDDDD" } },
        left: { style: "thin", color: { rgb: "DDDDDD" } },
        right: { style: "thin", color: { rgb: "DDDDDD" } }
      }
    };

    const overdueRowBaseStyle = {
      font: { color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "FF0000" } }, // Vermelho forte
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    const dueTodayRowBaseStyle = {
      font: { color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "FFFF00" } }, // Amarelo
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    const abonarCellStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "800080" } }, // Roxo intenso
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    for (let R = range.s.r; R <= range.e.r; ++R) { // Itera sobre as linhas
      const originalRowData = filteredForExport[R - 1]; // -1 porque R=0 é o cabeçalho, R=1 é a primeira linha de dados
      let baseStyleForDataRow = defaultRowBaseStyle;

      if (R === 0) { // Cabeçalho
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) ws[cellAddress] = {};
          ws[cellAddress].s = { ...headerStyle };
        }
      } else { // Linhas de dados
        if (isOverdue(originalRowData)) {
          baseStyleForDataRow = overdueRowBaseStyle;
        } else if (isDueToday(originalRowData)) {
          baseStyleForDataRow = dueTodayRowBaseStyle;
        }

        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const header = tableHeaders[C];
          const cellValue = ws[cellAddress] ? ws[cellAddress].v : undefined;

          if (!ws[cellAddress]) ws[cellAddress] = {};
          let currentCellStyle = { ...baseStyleForDataRow }; // Começa com o estilo base da linha

          // Estilos e valores específicos para 'Justificativa do Abono'
          if (header === 'Justificativa do Abono') {
            if (isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
              currentCellStyle = { ...abonarCellStyle }; // Sobrescreve com estilo de abonar
              ws[cellAddress].v = 'FALTA ABONAR'; // Garante o texto correto
              ws[cellAddress].t = 's'; // Tipo string
            } else {
              ws[cellAddress].t = 's'; // Tipo string
            }
          }
          // Estilos e valores específicos para 'Data Limite'
          else if (header === 'Data Limite') {
            const date = parseDateForComparison(originalRowData[header]);
            if (date && !isNaN(date)) {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const diffTime = date.getTime() - excelEpoch.getTime();
              const excelDate = diffTime / (1000 * 60 * 60 * 24);
              ws[cellAddress].v = excelDate; // Atribui o número de série
              ws[cellAddress].t = 'n'; // Tipo número
              currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
            } else {
              ws[cellAddress].t = 's'; // Tipo string
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
            }
          }
          // Estilos e valores específicos para 'CNPJ / CPF'
          else if (header === 'CNPJ / CPF') {
            ws[cellAddress].t = 's'; // Força como string para evitar problemas de formatação numérica
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
          }
          // Alinhamento para outras colunas
          else if (['Chamado', 'Numero Referencia', 'Status', 'Cidade'].includes(header)) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          } else {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
          }

          ws[cellAddress].s = currentCellStyle; // Atribui o estilo final à célula
        }
      }
    }

    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, parseDateForComparison, todayFormatted, isAbonarCondition]);

  return (
    <div className="App">
      <div className="header-container">
        <div className="logo-and-title">
          <h1>Painel de Pendências</h1>
        </div>
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
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="action-button">
              <FontAwesomeIcon icon={faUpload} /> Carregar Dados
            </button>
          </div>

          <div className="search-export-section">
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="action-button export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
            </button>
          </div>
        </div>
      </div>

      {error && <p className="error-message">Erro: {error}</p>}
      {loading && <p>Carregando dados...</p>}

      {data.length > 0 && (
        <div className="table-container">
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
