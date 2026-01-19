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
        } catch {
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 100)}...`; // Limita o tamanho do texto
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

      } else {
        setData([]);
        setTableHeaders([]);
        setFilterOptions({});
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
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison]);

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

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: []
    }));
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
    let filtered = data.filter(row => {
      // Filtro por termo de pesquisa
      const matchesSearch = searchTerm === '' || tableHeaders.some(header =>
        normalizeForComparison(row[header]).includes(normalizeForComparison(searchTerm))
      );

      // Filtro por opções de coluna
      const matchesFilters = Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        return selectedOptions.includes(String(row[column] || '').trim());
      });

      return matchesSearch && matchesFilters;
    });

    // Ordenação
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica de ordenação para Data Limite
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Ordenação para outros tipos de dados (strings, números)
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);

        if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
        if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Atualiza o contador de pendências atrasadas
    const overdueCount = filtered.filter(row => isOverdue(row)).length;
    setCurrentOverdueCount(overdueCount);

    return filtered;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, isDueToday, tableHeaders]);


  // Efeito para definir os cabeçalhos da tabela quando os dados são carregados
  useEffect(() => {
    if (data.length > 0) {
      // Garante que os cabeçalhos sejam definidos na ordem correta
      const extractedHeaders = Array.from(new Set(data.flatMap(Object.keys)));
      const orderedHeaders = defaultTableHeaders.filter(header => extractedHeaders.includes(header));
      const remainingHeaders = extractedHeaders.filter(header => !defaultTableHeaders.includes(header));
      setTableHeaders([...orderedHeaders, ...remainingHeaders]);
    } else {
      setTableHeaders([]);
    }
  }, [data, defaultTableHeaders]);


  // Função para exportar os dados filtrados (apenas pendências de hoje) para Excel
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      setError('Nenhum dado para exportar.');
      return;
    }

    // Filtra apenas as pendências de hoje ou atrasadas para exportação
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      setError('Nenhuma pendência atrasada ou para hoje para exportar.');
      return;
    }

    // Prepara os dados para a planilha
    const exportHeaders = tableHeaders;
    const ws_data = [exportHeaders.map(h => ({ v: h, t: 's' }))]; // Cabeçalhos como primeira linha

    filteredForExport.forEach(row => {
      const rowData = exportHeaders.map(header => {
        let value = row[header];
        let type = 's'; // Default to string

        if (header === 'Data Limite') {
          const date = parseDateForComparison(value);
          if (date) {
            // Excel epoch is 1899-12-30, JS epoch is 1970-01-01
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const diffTime = Math.abs(date.getTime() - excelEpoch.getTime());
            value = diffTime / (1000 * 60 * 60 * 24); // Convert to days
            type = 'n'; // Number type for dates
          } else {
            value = '';
          }
        } else if (header === 'CNPJ / CPF') {
          value = String(value || '').replace(/['"=]/g, '').trim();
          type = 's';
        } else if (header === 'Justificativa do Abono' && isOverdue(row) && isAbonarCondition(row)) {
          value = 'FALTA ABONAR';
          type = 's';
        } else {
          value = String(value || '');
        }
        return { v: value, t: type };
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
      fill: { fgColor: { rgb: "FF4472C4" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const defaultCellStyle = {
      font: { color: { rgb: "FF000000" } }, // Preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFD3D3D3" } }, // Cinza claro
        bottom: { style: "thin", color: { rgb: "FFD3D3D3" } },
        left: { style: "thin", color: { rgb: "FFD3D3D3" } },
        right: { style: "thin", color: { rgb: "FFD3D3D3" } },
      }
    };

    const overdueRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFC7CE" } }, // Vermelho claro
      font: { color: { rgb: "FF9C0006" } }, // Vermelho escuro
    };

    const dueTodayRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFFFEB" } }, // Amarelo claro
      font: { color: { rgb: "FF9C6500" } }, // Amarelo escuro
    };

    const abonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
    };

    // Aplica estilos aos cabeçalhos
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };
      ws[cellAddress].s = headerStyle;
    }

    // Aplica estilos aos dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
      let baseRowStyle = { ...defaultCellStyle };

      if (isOverdue(originalRowData)) {
        Object.assign(baseRowStyle, overdueRowBaseStyle);
      } else if (isDueToday(originalRowData)) {
        Object.assign(baseRowStyle, dueTodayRowBaseStyle);
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

        let currentCellStyle = { ...baseRowStyle }; // Começa com o estilo base da linha

        const header = exportHeaders[C];

        // Estilos específicos por coluna
        if (header === 'Data Limite') {
          currentCellStyle.numFmt = 'DD/MM/YYYY';
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        } else if (header === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
          Object.assign(currentCellStyle, abonarCellStyle);
        } else if (['Chamado', 'Numero Referencia', 'Status', 'Cidade'].includes(header)) {
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        } else if (['CNPJ / CPF', 'Serviço', 'Contratante', 'Cliente', 'Técnico', 'Prestador'].includes(header)) {
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
        }

        ws[cellAddress].s = currentCellStyle;
      }
    }

    // Ajusta a largura das colunas
    const colWidths = exportHeaders.map(header => {
      let width = header.length + 2; // Largura mínima baseada no cabeçalho
      const colData = filteredForExport.map(row => String(row[header] || '').length);
      const maxDataWidth = Math.max(...colData);
      width = Math.max(width, maxDataWidth + 2); // Garante espaço para o conteúdo
      return { wch: Math.min(width, 60) }; // Limita a largura máxima para não ficar muito grande
    });
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, todayFormatted, isOverdue, isAbonarCondition, isDueToday, parseDateForComparison]);


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
