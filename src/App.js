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
      setError('Por favor, selecione um arquivo CSV para fazer o upload.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // Usando 'file' como nome do campo, conforme esperado pelo backend

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler a resposta como JSON, se falhar, lê como texto
        let errorMessage = `Erro no servidor: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorMessage += ` - ${errorJson.message || JSON.stringify(errorJson)}`;
        } catch (e) {
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 200)}...`; // Limita o tamanho do texto
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        // Define os cabeçalhos da tabela com base nos dados, mas na ordem desejada
        const extractedHeaders = Object.keys(result[0]);
        const orderedHeaders = defaultTableHeaders.filter(header => extractedHeaders.includes(header));
        setTableHeaders(orderedHeaders);

        // Atualiza as opções de filtro com base nos novos dados
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          const options = [...new Set(result.map(row => String(row[header]).trim()))].sort();
          newFilterOptions[header] = options;
        });
        setFilterOptions(newFilterOptions);

      } else {
        setData([]);
        setTableHeaders([]);
        setFilterOptions({});
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Lida com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prevDir =>
      column === sortColumn ? (prevDir === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Lida com a pesquisa na tabela
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a mudança de seleção de opções de filtro
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

  // Aplica o filtro de uma coluna específica
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa o filtro de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && activeFilterColumn) {
        // Verifica se o clique não foi no ícone de filtro da coluna ativa
        const filterIcon = document.querySelector(`.filter-icon.active`);
        if (filterIcon && filterIcon.contains(event.target)) {
          return; // Não fecha se clicou no próprio ícone de filtro
        }
        setActiveFilterColumn(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef, activeFilterColumn]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    Object.keys(selectedFilterOptions).forEach(column => {
      const selectedOptions = selectedFilterOptions[column];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(String(row[column]).trim())
        );
      }
    });

    // Calcula o contador de pendências atrasadas
    const count = filteredData.filter(row => isOverdue(row)).length;
    setCurrentOverdueCount(count);

    // Aplica ordenação
    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        let comparison = 0;
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);
          if (dateA && dateB) {
            comparison = dateA.getTime() - dateB.getTime();
          } else if (dateA) {
            comparison = -1;
          } else if (dateB) {
            comparison = 1;
          }
        } else {
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
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison, isOverdue, tableHeaders]);

  // Exporta dados para Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as pendências atrasadas ou que vencem hoje
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas ou que vencem hoje para exportar.');
      return;
    }

    const ws_name = "Pendencias";
    const wb = XLSX.utils.book_new();

    // Prepara os dados para a planilha, incluindo os cabeçalhos como a primeira linha
    const ws_data = [
      tableHeaders, // Cabeçalhos na primeira linha
      ...filteredForExport.map(row => tableHeaders.map(header => {
        // Formatação especial para CNPJ/CPF para evitar problemas de número no Excel
        if (header === 'CNPJ / CPF') {
          return String(row[header] || '').replace(/['"=]/g, '').trim();
        }
        // Retorna o valor original para outras colunas
        return row[header];
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Define larguras de coluna (ajuste conforme necessário)
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço' || header === 'Justificativa do Abono') width = 30;
      if (header === 'Contratante' || header === 'Cliente') width = 25;
      if (header === 'Numero Referencia' || header === 'CNPJ / CPF') width = 20;
      if (header === 'Data Limite') width = 18;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para o cabeçalho
    const headerStyle = {
      fill: { fgColor: { rgb: "FF4472C4" } }, // Azul escuro (ARGB)
      font: { color: { rgb: "FFFFFFFF" }, bold: true, name: "Calibri", sz: 11 }, // Texto branco, negrito, Calibri 11
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Estilos base para as linhas de dados
    const defaultRowBaseStyle = {
      font: { color: { rgb: "FF000000" }, name: "Calibri", sz: 11 }, // Texto preto padrão
      fill: { fgColor: { rgb: "FFE0F2F7" } }, // Azul claro suave (ARGB)
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFDDDDDD" } }, // Cinza claro
        bottom: { style: "thin", color: { rgb: "FFDDDDDD" } },
        left: { style: "thin", color: { rgb: "FFDDDDDD" } },
        right: { style: "thin", color: { rgb: "FFDDDDDD" } },
      }
    };

    // Estilo para linhas atrasadas (vermelho intenso)
    const overdueRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { rgb: "FFC00000" } }, // Vermelho intenso (ARGB)
      font: { color: { rgb: "FFFFFFFF" }, bold: true, name: "Calibri", sz: 11 }, // Texto branco, negrito
    };

    // Estilo para linhas que vencem hoje (amarelo)
    const dueTodayRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { rgb: "FFFFC000" } }, // Amarelo (ARGB)
      font: { color: { rgb: "FF000000" }, bold: true, name: "Calibri", sz: 11 }, // Texto preto, negrito
    };

    // Estilo para a célula "FALTA ABONAR"
    const abonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso (ARGB)
      font: { color: { rgb: "FFFFFFFF" }, bold: true, name: "Calibri", sz: 11 }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplica estilos às células
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) { // Itera sobre as linhas
      let originalRowData = null;
      if (R > 0) { // Para linhas de dados (ignorando o cabeçalho)
        originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
      }

      let baseStyleForDataRow = defaultRowBaseStyle;
      if (originalRowData) { // Garante que há dados para a linha
        if (isOverdue(originalRowData)) {
          baseStyleForDataRow = overdueRowBaseStyle;
        } else if (isDueToday(originalRowData)) {
          baseStyleForDataRow = dueTodayRowBaseStyle;
        }
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const header = tableHeaders[C];
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[cellAddress];

        if (!cell) { // Se a célula não existe, cria uma com tipo string e valor vazio
          cell = { t: 's', v: '' };
          ws[cellAddress] = cell;
        }

        // Aplica estilo do cabeçalho
        if (R === 0) {
          cell.s = { ...headerStyle };
        } else { // Linhas de dados
          cell.s = { ...baseStyleForDataRow }; // Aplica o estilo base da linha

          // Ajustes de alinhamento para colunas específicas
          if (['Chamado', 'Numero Referencia', 'Status', 'Data Limite', 'Cidade'].includes(header)) {
            cell.s.alignment = { ...cell.s.alignment, horizontal: "center" };
          } else {
            cell.s.alignment = { ...cell.s.alignment, horizontal: "left" };
          }

          // Lógica para "FALTA ABONAR"
          if (header === 'Justificativa do Abono' && originalRowData && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            cell.v = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR"
            cell.s = { ...abonarCellStyle }; // Aplica o estilo roxo completo
          }

          // Formatação de Data Limite
          if (header === 'Data Limite' && originalRowData && originalRowData[header]) {
            const dateValue = parseDateForComparison(originalRowData[header]);
            if (dateValue && !isNaN(dateValue)) {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const diffTime = dateValue.getTime() - excelEpoch.getTime();
              const excelDate = diffTime / (1000 * 60 * 60 * 24);
              cell.v = excelDate; // Valor numérico para o Excel
              cell.t = 'n'; // Tipo numérico
              cell.s.numFmt = 'DD/MM/YYYY'; // Formato de exibição
            } else {
              // Se a data for inválida, mantém o valor original como string
              cell.v = originalRowData[header];
              cell.t = 's';
            }
          }
          // CNPJ / CPF como texto
          if (header === 'CNPJ / CPF' && originalRowData && originalRowData[header]) {
            cell.v = String(originalRowData[header] || '').replace(/['"=]/g, '').trim();
            cell.t = 's'; // Força como texto
          }
        }
      }
    }

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    XLSX.utils.book_append_sheet(wb, ws, ws_name);

    // Define a cor da aba (Sheet Tab Color)
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
    wb.Workbook.Views[0].TabColor = { rgb: "FF4472C4" }; // Azul escuro (ARGB)

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
              <button onClick={exportToExcel} disabled={data.length === 0} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <p className="error-message">Erro: {error}</p>}

      {data.length > 0 && (
        <div className="table-container">
          <div className="overdue-count-display">
            <h3>Pendências Atrasadas: {currentOverdueCount}</h3>
          </div>
          <div className="table-wrapper"> {/* Novo wrapper para a tabela */}
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
