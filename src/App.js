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

  // Obtém a data de hoje sem informações de tempo para comparação
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Função auxiliar para parsear datas de forma consistente para comparação
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return null;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]); // Adicionado parseDateForComparison

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]); // Adicionado parseDateForComparison

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim(); // <-- CORREÇÃO AQUI: Usando diretamente
    const status = normalizeForComparison(row['Status']);
    const dataLimite = parseDateForComparison(row['Data Limite']);

    // Condição: Justificativa vazia OU "FALTA ABONAR" E Status não é "ENCAMINHADA" E Data Limite é menor ou igual a hoje
    return (
      (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar') &&
      status !== 'encaminhada' &&
      dataLimite &&
      dataLimite <= today
    );
  }, [normalizeForComparison, parseDateForComparison, today]);

  // Lida com a seleção de arquivo
  const handleFileChange = useCallback((event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]);
    setTableHeaders([]);
  }, []);

  // Processa o arquivo CSV
  const processCsv = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders([]);

    const formData = new FormData();
    formData.append('file', file); // Nome do campo deve corresponder ao esperado pelo backend (multer)

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

      if (result.length > 0) {
        // Garante que os cabeçalhos da tabela sigam a ordem definida em defaultTableHeaders
        const orderedHeaders = defaultTableHeaders.filter(header => result[0].hasOwnProperty(header));
        setTableHeaders(orderedHeaders);
        setData(result);

        // Extrai opções de filtro dinamicamente
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          if (header !== 'Data Limite' && header !== 'CNPJ / CPF') { // Exclui colunas que não fazem sentido filtrar por texto
            const uniqueValues = [...new Set(result.map(row => String(row[header]).trim()))].sort((a, b) => a.localeCompare(b));
            newFilterOptions[header] = uniqueValues;
          }
        });
        setFilterOptions(newFilterOptions);
      } else {
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro ao processar CSV:', err);
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

  // Lida com a mudança no termo de busca
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Lida com a seleção de opções de filtro
  const handleFilterChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentSelection = prev[column] || [];
      if (currentSelection.includes(option)) {
        return {
          ...prev,
          [column]: currentSelection.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [column]: [...currentSelection, option]
        };
      }
    });
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
      // Filtro por termo de busca global
      const matchesSearch = searchTerm === '' || tableHeaders.some(header =>
        normalizeForComparison(row[header]).includes(normalizeForComparison(searchTerm))
      );

      // Filtro por colunas específicas
      const matchesFilters = tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        }
        return selectedOptions.includes(String(row[header]).trim());
      });

      return matchesSearch && matchesFilters;
    });

    // Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
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
          comparison = normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue));
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    // Atualiza o contador de pendências
    const overdueCount = filteredData.filter(row => isOverdue(row) || isDueToday(row)).length;
    setCurrentOverdueCount(overdueCount);

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, isDueToday, tableHeaders]);

  // Formata a data para exibição na tabela
  const formatDataLimite = useCallback((dateString) => {
    const date = parseDateForComparison(dateString);
    return date ? date.toLocaleDateString('pt-BR') : '';
  }, [parseDateForComparison]);

  // Retorna o texto para a célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'] || '';
  }, [isAbonarCondition]);

  // Retorna o estilo para a célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: 'white',
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isAbonarCondition]);

  // Retorna a classe CSS para a linha da tabela com base no status e data
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) return 'row-overdue';
    if (isDueToday(row)) return 'row-due-today';
    // Se não está atrasada nem vence hoje, e a justificativa não é "FALTA ABONAR", usa o azul padrão
    if (!isAbonarCondition(row)) return 'row-default-blue';
    return ''; // Se for "FALTA ABONAR" mas não atrasada/vencendo hoje, não aplica cor de linha
  }, [isOverdue, isDueToday, isAbonarCondition]); // <-- CORREÇÃO AQUI: Removido getJustificativaCellText

  // Exporta os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    const fileName = `Relatorio_OS_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;

    // Filtra apenas as pendências para exportação
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    // Se não houver dados para exportar, avisa o usuário
    if (filteredForExport.length === 0) {
      alert('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    // Prepara os dados para a planilha, formatando datas e CNPJ/CPF
    const exportData = filteredForExport.map(row => {
      const newRow = {};
      defaultTableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          const date = parseDateForComparison(row[header]);
          newRow[header] = date ? XLSX.utils.date_to_num(date) : ''; // Converte para número de série do Excel
        } else if (header === 'CNPJ / CPF') {
          newRow[header] = String(row[header] || '').replace(/['"=]/g, '').trim(); // Garante que seja string
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row); // Usa a lógica de texto da justificativa
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData, { header: defaultTableHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // --- Definição de Estilos ---
    const baseBorder = {
      top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    };

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4472C4' } }, // Azul escuro
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: baseBorder,
    };

    const defaultBlueRowStyle = {
      font: { color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFADD8E6' } }, // Azul clarinho
      alignment: { vertical: 'center' },
      border: baseBorder,
    };

    const overdueRowStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FFDC3545' } }, // Vermelho intenso
      alignment: { vertical: 'center' },
      border: baseBorder,
    };

    const dueTodayRowStyle = {
      font: { bold: true, color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFFF00' } }, // Amarelo
      alignment: { vertical: 'center' },
      border: baseBorder,
    };

    const abonarCellStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: baseBorder,
    };

    // Aplica estilos aos cabeçalhos
    defaultTableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: header };
      ws[cellAddress].s = headerStyle;
    });

    // Aplica estilos às linhas de dados
    for (let R = 1; R <= exportData.length; R++) {
      const rowData = filteredForExport[R - 1]; // Pega os dados originais da linha para as condições
      let currentRowBaseStyle = { ...defaultBlueRowStyle }; // Padrão: azul clarinho

      if (isOverdue(rowData)) {
        currentRowBaseStyle = { ...overdueRowStyle };
      } else if (isDueToday(rowData)) {
        currentRowBaseStyle = { ...dueTodayRowStyle };
      }
      // Se não for atrasada nem vence hoje, permanece azul clarinho (defaultBlueRowStyle)

      defaultTableHeaders.forEach((header, C) => {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress] || {}; // Garante que a célula exista

        // Inicializa o objeto de estilo da célula se não existir
        if (!cell.s) cell.s = {};

        // Aplica o estilo base da linha
        Object.assign(cell.s, currentRowBaseStyle);

        // --- Estilos específicos por coluna ---
        if (header === 'Data Limite') {
          cell.t = 'n'; // Tipo numérico para datas
          cell.s.numFmt = 'DD/MM/YYYY'; // Formato de data
          cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' }; // Centraliza
        } else if (header === 'CNPJ / CPF') {
          cell.t = 's'; // Tipo string para CNPJ/CPF
          cell.s.numFmt = '@'; // Formato de texto
          cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' }; // Centraliza
        } else if (header === 'Justificativa do Abono' && isAbonarCondition(rowData)) {
          // Aplica o estilo roxo, sobrescrevendo o fundo da linha
          Object.assign(cell.s, abonarCellStyle);
        }

        ws[cellAddress] = cell; // Atualiza a célula na planilha
      });
    }

    // Ajusta a largura das colunas dinamicamente
    const colWidths = defaultTableHeaders.map((header) => {
      const headerLength = header.length;
      const maxCellLength = Math.max(...exportData.map(row => String(row[header] || '').length));
      return { wch: Math.max(headerLength, maxCellLength) + 2 }; // +2 para padding
    });
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ r: 0, c: defaultTableHeaders.length - 1 })}` };

    // Congela a primeira linha (cabeçalho)
    ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    XLSX.writeFile(wb, fileName);
  }, [filteredAndSortedData, defaultTableHeaders, parseDateForComparison, isOverdue, isDueToday, getJustificativaCellText, isAbonarCondition]);

  // Efeito para atualizar os cabeçalhos da tabela quando os dados mudam
  useEffect(() => {
    if (data.length > 0) {
      const orderedHeaders = defaultTableHeaders.filter(header => data[0].hasOwnProperty(header));
      setTableHeaders(orderedHeaders);
    } else {
      setTableHeaders([]);
    }
  }, [data, defaultTableHeaders]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Selecionar CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            {data.length > 0 && (
              <>
                <div className="search-container">
                  <FontAwesomeIcon icon={faSearch} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Buscar na tabela..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="search-input"
                  />
                </div>
                <button onClick={exportToExcel} className="export-button">
                  <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
                </button>
                {currentOverdueCount > 0 && (
                  <div className="overdue-count">
                    {currentOverdueCount} Pendência{currentOverdueCount > 1 ? 's' : ''}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="header-content">
                      <div className="sortable-header" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon" />}
                      </div>
                      {filterOptions[header] && filterOptions[header].length > 0 && (
                        <div className="filter-wrapper" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                          <div
                            className={`filter-icon-container ${activeFilterColumn === header ? 'active' : ''}`}
                            onClick={() => toggleFilterDropdown(header)}
                          >
                            <FontAwesomeIcon icon={faFilter} className="filter-icon" />
                            {selectedFilterOptions[header] && selectedFilterOptions[header].length > 0 && (
                              <span className="filter-active-dot"></span>
                            )}
                          </div>
                          {activeFilterColumn === header && (
                            <div className="filter-dropdown">
                              {filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    value={option}
                                    checked={selectedFilterOptions[header]?.includes(option) || false}
                                    onChange={() => handleFilterChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
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
