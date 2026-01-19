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

  // Função para normalizar strings para comparação (remove acentos, caixa baixa, espaços)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Obtém a data de hoje sem a parte da hora para comparações
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Função para parsear datas (DD/MM/YYYY ou YYYY-MM-DD) para objetos Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = String(dateString).split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      const d = new Date(year, month - 1, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    // Tenta parsear como YYYY-MM-DD (útil se o backend retornar assim)
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
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
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Verifica a condição "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    // A condição é: a OS está atrasada E (a justificativa está vazia OU é "falta abonar")
    return isOverdue(row) && (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);

  // Define o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    return isAbonarCondition(row) ? 'FALTA ABONAR' : row['Justificativa do Abono'];
  }, [isAbonarCondition]);

  // Define o estilo da célula "Justificativa do Abono"
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

  // Efeito para calcular o contador de pendências
  useEffect(() => {
    if (data.length > 0) {
      const count = data.filter(row => isOverdue(row) || isDueToday(row)).length;
      setCurrentOverdueCount(count);
    } else {
      setCurrentOverdueCount(0);
    }
  }, [data, isOverdue, isDueToday]);

  // Efeito para popular os cabeçalhos da tabela e as opções de filtro
  useEffect(() => {
    if (data.length > 0) {
      // Usa os cabeçalhos padrão para garantir a ordem
      setTableHeaders(defaultTableHeaders);

      // Gera opções de filtro dinamicamente
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        if (header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Chamado' && header !== 'Numero Referencia') { // Exclui colunas que não fazem sentido filtrar por lista
          const options = [...new Set(data.map(row => String(row[header] || '').trim()))].filter(Boolean).sort();
          newFilterOptions[header] = options;
        }
      });
      setFilterOptions(newFilterOptions);

      // Inicializa selectedFilterOptions se ainda não estiverem definidos para alguns cabeçalhos
      const initialSelected = { ...selectedFilterOptions };
      defaultTableHeaders.forEach(header => {
        if (header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Chamado' && header !== 'Numero Referencia' && !initialSelected[header]) {
          initialSelected[header] = []; // Inicializa como array vazio se não houver seleção prévia
        }
      });
      setSelectedFilterOptions(initialSelected);

    } else {
      setTableHeaders([]);
      setFilterOptions({});
      setSelectedFilterOptions({
        'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
      });
    }
  }, [data, defaultTableHeaders, selectedFilterOptions]); // Adicionado selectedFilterOptions para evitar loop infinito e garantir que o estado seja o mais recente

  // Lida com o upload do arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]); // Limpa os dados da tabela ao selecionar um novo arquivo
  };

  // Processa o arquivo CSV
  const handleProcessCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve ser 'file' para corresponder ao backend

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
      if (result.length === 0) {
        setError('Nenhum dado válido foi encontrado no arquivo CSV.');
        setData([]);
      } else {
        setData(result);
      }
    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
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

  // Lida com a mudança de filtro
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

  // Alterna a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Filtra e ordena os dados da tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtros
    filteredData = filteredData.filter(row => {
      for (const header in selectedFilterOptions) {
        const selected = selectedFilterOptions[header];
        if (selected && selected.length > 0) {
          const rowValue = String(row[header] || '').trim();
          if (!selected.includes(rowValue)) {
            return false;
          }
        }
      }
      return true;
    });

    // Aplica pesquisa
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica ordenação
    const sortedData = [...filteredData].sort((a, b) => {
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
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue));
      } else {
        if (aValue < bValue) comparison = -1;
        if (aValue > bValue) comparison = 1;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, tableHeaders]);

  // Retorna a classe CSS para a linha da tabela com base no status e data
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) return 'row-overdue';
    if (isDueToday(row)) return 'row-due-today';
    // Se não está atrasada nem vence hoje, e a justificativa não é "FALTA ABONAR", usa o azul padrão
    if (!isAbonarCondition(row)) return 'row-default-blue';
    return ''; // Se for "FALTA ABONAR" mas não atrasada/vencendo hoje, não aplica cor de linha
  }, [isOverdue, isDueToday, isAbonarCondition]);


  // Formata a data para exibição na tabela
  const formatDataLimite = useCallback((dateString) => {
    const date = parseDateForComparison(dateString);
    if (date) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
  }, [parseDateForComparison]);

  // Exporta os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    // Filtra apenas as pendências do dia (atrasadas ou vencendo hoje) para exportação
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há dados de pendências (atrasadas ou vencendo hoje) para exportar.');
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
          newRow[header] = String(row[header] || '').replace(/['"=]/g, '').trim(); // Garante que seja string e limpa
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row); // Usa o texto formatado "FALTA ABONAR"
        }
        else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData, { header: defaultTableHeaders });

    // --- Aplicação de Estilos ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');

    // Estilos base
    const baseBorder = {
      top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    };

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4472C4' } }, // Azul escuro
      alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
      border: baseBorder,
    };

    const defaultBlueRowStyle = {
      fill: { fgColor: { argb: 'FFADD8E6' } }, // Azul clarinho
      font: { color: { argb: 'FF000000' } }, // Preto
      alignment: { vertical: 'center', horizontal: 'left' },
      border: baseBorder,
    };

    const overdueRowStyle = {
      fill: { fgColor: { argb: 'FFDC3545' } }, // Vermelho intenso
      font: { color: { argb: 'FFFFFFFF' } }, // Branco
      alignment: { vertical: 'center', horizontal: 'left' },
      border: baseBorder,
    };

    const dueTodayRowStyle = {
      fill: { fgColor: { argb: 'FFFFFF00' } }, // Amarelo
      font: { color: { argb: 'FF000000' } }, // Preto
      alignment: { vertical: 'center', horizontal: 'left' },
      border: baseBorder,
    };

    const abonarCellStyle = {
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
      border: baseBorder,
    };

    // Aplica estilos aos cabeçalhos
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: defaultTableHeaders[C] || '' }; // Garante que a célula exista
      ws[cellAddress].s = headerStyle;
    }

    // Aplica estilos às linhas de dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Começa da segunda linha (índice 1)
      const originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
      let currentRowBaseStyle = { ...defaultBlueRowStyle }; // Estilo padrão azul clarinho

      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = { ...overdueRowStyle };
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = { ...dueTodayRowStyle };
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Garante que a célula exista

        const header = defaultTableHeaders[C];
        let currentCellStyle = { ...currentRowBaseStyle }; // Começa com o estilo base da linha

        // Estilos específicos por coluna
        if (header === 'Data Limite') {
          currentCellStyle.numFmt = 'DD/MM/YYYY';
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: 'center' };
          ws[cellAddress].t = 'n'; // Tipo numérico para datas
        } else if (header === 'CNPJ / CPF') {
          currentCellStyle.numFmt = '@'; // Formato de texto
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: 'center' };
          ws[cellAddress].t = 's'; // Tipo string para CNPJ/CPF
        } else if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
          // Mescla o estilo roxo, sobrescrevendo o fundo da linha
          currentCellStyle = { ...currentCellStyle, ...abonarCellStyle };
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: 'center' };
          ws[cellAddress].t = 's'; // Tipo string para justificativa
        } else {
          ws[cellAddress].t = 's'; // Tipo padrão string para outras células
        }

        ws[cellAddress].s = currentCellStyle;
      }
    }

    // Ajusta a largura das colunas dinamicamente
    ws['!cols'] = defaultTableHeaders.map((header, index) => {
      const maxLength = Math.max(
        header.length,
        ...exportData.map(row => String(row[header] || '').length)
      );
      return { wch: maxLength + 2 }; // Adiciona um pequeno padding
    });

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: range.s.r + ':' + range.e.r };

    // Congela a primeira linha (cabeçalho)
    ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    XLSX.writeFile(wb, 'Pendencias_OS.xlsx');
  }, [filteredAndSortedData, isOverdue, isDueToday, isAbonarCondition, getJustificativaCellText, parseDateForComparison, defaultTableHeaders]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Selecionar CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            <button onClick={handleProcessCsv} disabled={!file || loading} className="process-csv-button">
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
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
                <button onClick={exportToExcel} className="export-button">
                  <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências
                </button>
                <div className="overdue-count">
                  Pendências: {currentOverdueCount}
                </div>
              </>
            )}
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} onClick={() => handleSort(header)}>
                    <div className="header-content">
                      {header}
                      <span className="sort-icon">
                        {sortColumn === header && sortDirection === 'asc' && <FontAwesomeIcon icon={faSortUp} />}
                        {sortColumn === header && sortDirection === 'desc' && <FontAwesomeIcon icon={faSortDown} />}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-inactive" />}
                      </span>
                      {(header === 'Status' || header === 'Cidade' || header === 'Técnico' || header === 'Prestador' || header === 'Contratante' || header === 'Serviço') && (
                        <div className="filter-dropdown-wrapper" ref={filterDropdownRef}>
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
