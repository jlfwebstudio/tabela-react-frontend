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

  const filterDropdownRef = useRef(null);
  const filterButtonRefs = useRef({}); // Para fechar o dropdown ao clicar em outro botão de filtro

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
    const cleanedDateString = String(dateString).split(' ')[0].trim(); // Pega só a parte da data e limpa espaços

    // Tenta formato DD/MM/YYYY
    let parts = cleanedDateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
      if (!isNaN(date.getTime())) return date;
    }

    // Tenta formato YYYY-MM-DD (comum em alguns sistemas ou CSVs)
    parts = cleanedDateString.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    // Fallback para o parser nativo (pode funcionar com outros formatos)
    const nativeDate = new Date(cleanedDateString);
    nativeDate.setHours(0, 0, 0, 0);
    if (!isNaN(nativeDate.getTime())) return nativeDate;

    return null; // Retorna null se não conseguir parsear
  }, []);

  // Obtém a data de hoje, zerando a hora para comparações precisas
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    return dataLimite && dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    return dataLimite && dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    return isOverdue(row) && (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);

  // Retorna a classe CSS para a linha da tabela
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul clarinho
  }, [isOverdue, isDueToday]);

  // Retorna o estilo para a célula "Justificativa do Abono"
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

  // Retorna o texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isAbonarCondition]);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  // Contador de pendências (OSs atrasadas ou vencendo hoje)
  const overdueCountDisplay = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Lida com a seleção do arquivo CSV
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]);
    setTableHeaders([]);
  };

  // Processa o arquivo CSV
  const processCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // O backend espera 'file'

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar o arquivo CSV.');
      }

      const result = await response.json();
      if (result.length > 0) {
        // Garante que os cabeçalhos da tabela sigam a ordem definida em defaultTableHeaders
        const actualHeaders = Object.keys(result[0]);
        const orderedHeaders = defaultTableHeaders.filter(header => actualHeaders.includes(header));
        setTableHeaders(orderedHeaders);
        setData(result);

        // Inicializa as opções de filtro
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(row => String(row[header]).trim()))].filter(Boolean).sort();
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);

        // Reseta os filtros selecionados para o estado inicial (Status filtrado)
        setSelectedFilterOptions({
          'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
        });

      } else {
        setData([]);
        setTableHeaders([]);
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de filtragem e ordenação
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // Aplica filtro de texto
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    currentData = currentData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se não há opções selecionadas para este cabeçalho, não filtra
        }
        const rowValue = String(row[header]).trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Aplica ordenação
    if (sortColumn) {
      currentData = [...currentData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
            : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
        } else {
          // Fallback para outros tipos ou valores não string
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    return currentData;
  }, [data, searchTerm, tableHeaders, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Lida com a ordenação da tabela
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Lida com a mudança de opção de filtro
  const handleFilterOptionChange = (header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [header]: [...currentOptions, option]
        };
      }
    });
  };

  // Limpa o filtro de uma coluna específica
  const clearColumnFilter = (header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
  };

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum dos botões de filtro
        const clickedOnFilterButton = Object.values(filterButtonRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterButton) {
          setActiveFilterColumn(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para exportar os dados filtrados e ordenados para Excel com estilos
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(filteredAndSortedData, { header: defaultTableHeaders });

    // Definir estilos para cabeçalhos
    const headerStyle = {
      font: { name: 'Arial', sz: 12, bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF2C3E50' } }, // Azul escuro
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      }
    };

    // Estilos para as linhas
    const defaultBlueRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF333333' } },
      fill: { fgColor: { argb: 'FFADD8E6' } }, // Azul clarinho
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
      }
    };

    const overdueRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF333333' } },
      fill: { fgColor: { argb: 'FFFFCCCC' } }, // Vermelho claro
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
      }
    };

    const dueTodayRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF333333' } },
      fill: { fgColor: { argb: 'FFFFFF99' } }, // Amarelo claro
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
      }
    };

    const abonarCellStyle = {
      font: { name: 'Arial', sz: 10, bold: true, color: { argb: 'FFFFFFFF' } }, // Branco, negrito
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
      }
    };

    // Aplica estilos aos cabeçalhos
    defaultTableHeaders.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellAddress]) ws[cellAddress] = {};
      ws[cellAddress].s = headerStyle;
    });

    // Aplica estilos às células de dados
    for (let R = 0; R < filteredAndSortedData.length; ++R) {
      const originalRowData = filteredAndSortedData[R];
      let currentRowBaseStyle = defaultBlueRowStyle; // Padrão: azul clarinho

      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = overdueRowStyle; // Vermelho tem prioridade
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = dueTodayRowStyle; // Amarelo tem segunda prioridade
      }

      defaultTableHeaders.forEach((header, C) => {
        const cellAddress = XLSX.utils.encode_cell({ r: R + 1, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = {};

        // Aplica o estilo base da linha
        ws[cellAddress].s = { ...currentRowBaseStyle };

        // Formatação específica para "Data Limite"
        if (header === 'Data Limite') {
          const date = parseDateForComparison(originalRowData[header]);
          if (date) {
            ws[cellAddress].v = XLSX.utils.date_to_num(date); // <--- CORREÇÃO AQUI
            ws[cellAddress].t = 'n'; // Tipo numérico
            ws[cellAddress].s.numFmt = 'DD/MM/YYYY';
            ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'center' };
          } else {
            ws[cellAddress].v = originalRowData[header];
            ws[cellAddress].t = 's'; // Tipo string se não for data válida
          }
        }
        // Formatação específica para "CNPJ / CPF"
        else if (header === 'CNPJ / CPF') {
          ws[cellAddress].v = String(originalRowData[header] || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Força como texto
          ws[cellAddress].s.numFmt = '@'; // Formato de texto
          ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'center' };
        }
        // Estilo específico para "Justificativa do Abono" (roxo)
        else if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
          ws[cellAddress].v = 'FALTA ABONAR';
          ws[cellAddress].t = 's';
          ws[cellAddress].s = { ...ws[cellAddress].s, ...abonarCellStyle }; // Mescla com o estilo da linha
        }
        // Para outras células, apenas garante o valor e tipo
        else {
          ws[cellAddress].v = originalRowData[header];
          ws[cellAddress].t = typeof originalRowData[header] === 'number' ? 'n' : 's';
        }
      });
    }

    // Ajusta a largura das colunas dinamicamente
    const colWidths = defaultTableHeaders.map((header, colIndex) => {
      const headerLength = header.length;
      const maxCellLength = filteredAndSortedData.reduce((max, row) => {
        const cellValue = String(row[header] || '');
        return Math.max(max, cellValue.length);
      }, 0);
      return { wch: Math.min(Math.max(headerLength, maxCellLength) + 2, 60) }; // Limita a largura máxima para não ficar gigante
    });
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref'])) };

    // Congela a primeira linha (cabeçalho)
    ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');
    XLSX.writeFile(wb, 'pendencias.xlsx');
  }, [filteredAndSortedData, defaultTableHeaders, isOverdue, isDueToday, isAbonarCondition, parseDateForComparison]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="csv-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Escolher CSV'}
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
            </button>
            {data.length > 0 && (
              <span className="overdue-count">
                Pendentes Hoje: {overdueCountDisplay}
              </span>
            )}
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="table-container">
          <div className="search-bar">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar em todas as colunas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon-default" />}
                      </span>
                      <div className="filter-wrapper">
                        <button
                          className="filter-button"
                          onClick={(e) => {
                            e.stopPropagation(); // Evita que o clique no botão feche o dropdown imediatamente
                            setActiveFilterColumn(activeFilterColumn === header ? null : header);
                          }}
                          ref={el => filterButtonRefs.current[header] = el} // Armazena a referência do botão
                        >
                          <FontAwesomeIcon icon={faFilter} />
                        </button>
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-list">
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
                              <button onClick={() => setActiveFilterColumn(null)}>Aplicar</button>
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
