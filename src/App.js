// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  // Inicializa selectedFilterOptions com os 5 status desejados para a coluna 'Status'
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ABERTO', 'EM ATENDIMENTO', 'AGUARDANDO PEÇAS', 'AGUARDANDO CLIENTE', 'AGENDADO']
  });
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
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

  // Função auxiliar para normalizar strings (remover acentos, converter para minúsculas)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps, no-unused-vars
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/');
    // Retorna um objeto Date no formato YYYY-MM-DD para comparação consistente
    return new Date(`${year}-${month}-${day}`);
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Garante que a data seja exibida no formato DD/MM/YYYY
    const date = parseDateForComparison(dateString);
    if (isNaN(date.getTime())) return dateString; // Retorna original se for inválido
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, [parseDateForComparison]);

  const isOverdue = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limiteDate = parseDateForComparison(row['Data Limite']);
    return limiteDate && limiteDate < today;
  }, [parseDateForComparison]);

  const isDueToday = useCallback((row) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limiteDate = parseDateForComparison(row['Data Limite']);
    return limiteDate && limiteDate.getTime() === today.getTime();
  }, [parseDateForComparison]);

  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue'; // Cor azul claro para linhas neutras
  }, [isOverdue, isDueToday]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    return justificativa === 'FALTA ABONAR' ? 'FALTA ABONAR' : justificativa;
  }, []);

  const getJustificativaCellStyle = useCallback((row) => {
    if (row['Justificativa do Abono'] === 'FALTA ABONAR') {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, []);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
    } else {
      setFile(null);
      setFileName('');
      setData([]);
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler a resposta como texto para depuração, caso não seja JSON
        const errorText = await response.text();
        throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}. Verifique o console para mais detalhes.`);
    } finally {
      setLoading(false);
    }
  };

  const sortData = useCallback((column) => {
    const isAsc = sortColumn === column && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortColumn(column);
  }, [sortColumn, sortDirection]);

  const getSortIcon = useCallback((column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  }, [sortColumn, sortDirection]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

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

  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: [] // Limpa todas as opções para a coluna
    }));
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtros de coluna
    Object.keys(selectedFilterOptions).forEach(column => {
      const selectedOptions = selectedFilterOptions[column];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(row[column])
        );
      }
    });

    // Aplica filtro de busca global
    const normalizedSearchTerm = normalizeForComparison(searchTerm); // eslint-disable-line no-unused-vars
    if (normalizedSearchTerm) {
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Para outros tipos de dados (string, number)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]); // eslint-disable-line react-hooks/exhaustive-deps

  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = data.filter(row => {
      const limiteDate = parseDateForComparison(row['Data Limite']);
      return limiteDate && (limiteDate < today || limiteDate.getTime() === today.getTime());
    });

    if (dataToExport.length === 0) {
      alert('Não há dados pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos
    dataToExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Data Limite') {
          return formatDataLimite(row[header]);
        }
        if (header === 'CNPJ / CPF') {
          return String(row[header]); // Garante que CNPJ/CPF seja tratado como texto
        }
        return row[header];
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // --- APLICAÇÃO DE ESTILOS ---

    // Estilo padrão para células de dados
    const defaultCellStyle = {
      border: {
        top: { style: 'thin', color: { rgb: 'FFD3D3D3' } }, // Cinza claro
        bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
      },
      alignment: { vertical: 'center', horizontal: 'left' },
      font: { name: 'Calibri', sz: 11, color: { rgb: 'FF333333' } }, // Texto escuro padrão
      fill: { fgColor: { rgb: 'FFE0F2F7' } } // Azul claro padrão
    };

    // Estilo para cabeçalhos
    const headerStyle = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { rgb: 'FF2C3E50' } }, // Azul escuro
      alignment: { vertical: 'center', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'FFFFFFFF' } },
        bottom: { style: 'thin', color: { rgb: 'FFFFFFFF' } },
        left: { style: 'thin', color: { rgb: 'FFFFFFFF' } },
        right: { style: 'thin', color: { rgb: 'FFFFFFFF' } },
      },
    };

    // Estilo para linhas atrasadas (vermelho)
    const overdueStyle = {
      ...defaultCellStyle,
      font: { ...defaultCellStyle.font, color: { rgb: 'FFFFFFFF' } }, // Texto branco
      fill: { fgColor: { rgb: 'FFC00000' } } // Vermelho intenso
    };

    // Estilo para linhas vencendo hoje (amarelo)
    const dueTodayStyle = {
      ...defaultCellStyle,
      font: { ...defaultCellStyle.font, color: { rgb: 'FF333333' } }, // Texto escuro
      fill: { fgColor: { rgb: 'FFFFC000' } } // Amarelo
    };

    // Estilo para célula "FALTA ABONAR" (roxo)
    const faltaAbonarStyle = {
      ...defaultCellStyle,
      font: { ...defaultCellStyle.font, bold: true, color: { rgb: 'FFFFFFFF' } }, // Texto branco, negrito
      fill: { fgColor: { rgb: 'FF800080' } } // Roxo intenso
    };

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos aos dados
    for (let R = 0; R < dataToExport.length; R++) {
      const rowData = dataToExport[R];
      const rowIndexInSheet = R + 1; // +1 por causa dos cabeçalhos

      const isRowOverdue = isOverdue(rowData);
      const isRowDueToday = isDueToday(rowData);

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndexInSheet, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        let currentCellStyle = defaultCellStyle;

        // Determina o estilo da linha
        if (isRowOverdue) {
          currentCellStyle = overdueStyle;
        } else if (isRowDueToday) {
          currentCellStyle = dueTodayStyle;
        } else {
          currentCellStyle = defaultCellStyle;
        }

        // Sobrescreve para "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && rowData[header] === 'FALTA ABONAR') {
          currentCellStyle = faltaAbonarStyle;
        }

        ws[cellRef].s = currentCellStyle;

        // Formatação específica para Data Limite e CNPJ/CPF
        if (header === 'Data Limite') {
          ws[cellRef].t = 'd'; // Tipo data
          ws[cellRef].z = 'DD/MM/YYYY'; // Formato de exibição
          const dateValue = parseDateForComparison(rowData[header]);
          if (dateValue) {
            ws[cellRef].v = dateValue; // Valor como objeto Date
          } else {
            ws[cellRef].t = 's'; // Se inválido, trata como string
            ws[cellRef].v = rowData[header];
          }
        } else if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Força como texto
          ws[cellRef].v = String(rowData[header]);
        } else {
          ws[cellRef].v = rowData[header]; // Valor padrão
        }
      });
    }

    // Ajusta larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      if (header === 'Justificativa do Abono') width = 40;
      if (header === 'CNPJ / CPF') width = 20;
      if (header === 'Data Limite') width = 15;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'pendencias_hoje.xlsx');
  }, [data, tableHeaders, parseDateForComparison, formatDataLimite, isOverdue, isDueToday]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleFileUpload} className="process-csv-button" disabled={!file || loading}>
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>

          <div className="global-actions-section">
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
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              Exportar Pendentes Hoje
            </button>
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
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text" onClick={() => sortData(header)}>
                        {header}
                        <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                      </div>
                      <div className="filter-container" ref={filterDropdownRef}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Impede que o clique no ícone feche o dropdown imediatamente
                            toggleFilterDropdown(header);
                          }}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {[...new Set(data.map(row => row[header]))].sort().map(option => (
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
