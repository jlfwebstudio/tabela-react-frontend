import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faFilter } from '@fortawesome/free-solid-svg-icons'; // Removido faTimesCircle
import './App.css';

const App = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const filterDropdownRefs = useRef({});

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const tableHeaders = [
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
  ];

  // Status permitidos para exibição na tabela
  const allowedStatuses = [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ];

  // Função auxiliar para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = (str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  // Função para parsear data DD/MM/YYYY de forma segura
  const parseDate = (dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado no JS
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Verifica se a data é válida (ex: 31/02/2024 resultaria em 02/03/2024)
      if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
        return date;
      }
    }
    return null;
  };

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = (dateString) => {
    const date = parseDate(dateString);
    if (date) {
      return date.toLocaleDateString('pt-BR');
    }
    return dateString; // Retorna o original se não for uma data válida
  };

  // Função para verificar se a OS está atrasada ou vence hoje
  const isOverdueOrDueToday = useCallback((row) => {
    const status = normalizeForComparison(row['Status']);
    if (!allowedStatuses.map(normalizeForComparison).includes(status)) {
      return { isOverdue: false, isDueToday: false, needsAbono: false };
    }

    const dataLimiteStr = row['Data Limite'];
    const dataLimite = parseDate(dataLimiteStr);
    if (!dataLimite) {
      return { isOverdue: false, isDueToday: false, needsAbono: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data

    const limiteDate = new Date(dataLimite);
    limiteDate.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data

    const isOverdue = limiteDate < today;
    const isDueToday = limiteDate.getTime() === today.getTime();

    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const needsAbono = isOverdue && (!justificativa || justificativa === 'falta abonar');

    return { isOverdue, isDueToday, needsAbono };
  }, [allowedStatuses]);

  // Lógica de classes para colorir as linhas
  const getRowClass = useCallback((row) => {
    const { isOverdue, isDueToday } = isOverdueOrDueToday(row);
    if (isOverdue) {
      return 'row-overdue'; // Vermelho intenso para todas as atrasadas
    }
    if (isDueToday) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return '';
  }, [isOverdueOrDueToday]);

  // Lógica para formatar o valor da célula (ex: "FALTA ABONAR")
  const formatCellValue = useCallback((value, header, row) => {
    if (header === 'Justificativa do Abono') {
      const { isOverdue, needsAbono } = isOverdueOrDueToday(row);
      if (isOverdue && needsAbono) {
        return 'FALTA ABONAR';
      }
    }
    return value;
  }, [isOverdueOrDueToday]);

  // Lógica para classe da célula (ex: roxo para "FALTA ABONAR")
  const getCellClass = useCallback((value, header, row) => {
    if (header === 'Justificativa do Abono') {
      const { isOverdue, needsAbono } = isOverdueOrDueToday(row);
      if (isOverdue && needsAbono) {
        return 'cell-falta-abonar'; // Roxo para a célula
      }
    }
    return '';
  }, [isOverdueOrDueToday]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setError('');
    } else {
      setSelectedFile(null);
      setFileName('');
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Por favor, selecione um arquivo CSV para fazer o upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data && Array.isArray(response.data)) {
        // Filtra os dados com base nos status permitidos
        const filteredAndNormalizedData = response.data.filter(row => {
          const status = normalizeForComparison(row['Status']);
          return allowedStatuses.map(normalizeForComparison).includes(status);
        });
        setData(filteredAndNormalizedData);
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        // Caso o backend retorne um objeto com a chave 'data'
        const filteredAndNormalizedData = response.data.data.filter(row => {
          const status = normalizeForComparison(row['Status']);
          return allowedStatuses.map(normalizeForComparison).includes(status);
        });
        setData(filteredAndNormalizedData);
      } else {
        setError('Formato de dados inesperado do servidor.');
        setData([]);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao fazer upload do arquivo: ${err.response?.data?.error || err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  };

  const toggleFilterDropdown = (column) => {
    setFilterDropdownOpen(filterDropdownOpen === column ? null : column);
  };

  const handleFilterOptionChange = (column, option, isChecked) => {
    setColumnFilters(prevFilters => {
      const currentOptions = prevFilters[column] || [];
      if (isChecked) {
        return { ...prevFilters, [column]: [...currentOptions, option] };
      } else {
        return { ...prevFilters, [column]: currentOptions.filter(item => item !== option) };
      }
    });
  };

  const applyFilter = (column) => {
    setFilterDropdownOpen(null); // Fecha o dropdown após aplicar
  };

  const clearFilter = (column) => {
    setColumnFilters(prevFilters => ({
      ...prevFilters,
      [column]: [],
    }));
    setFilterDropdownOpen(null); // Fecha o dropdown após limpar
  };

  // Removido clearAllFilters pois não está sendo usado
  // const clearAllFilters = () => {
  //   setColumnFilters({});
  //   setFilterDropdownOpen(null);
  // };

  const filteredData = data.filter(row => {
    return tableHeaders.every(header => {
      const filterValues = columnFilters[header];
      if (!filterValues || filterValues.length === 0) {
        return true; // Nenhum filtro aplicado para esta coluna
      }
      const cellValue = normalizeForComparison(row[header]);
      return filterValues.some(filterVal => cellValue.includes(normalizeForComparison(filterVal)));
    });
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0;

    const aValue = a[sortColumn];
    const bValue = b[sortColumn];

    // Tratamento especial para Data Limite
    if (sortColumn === 'Data Limite') {
      const dateA = parseDate(aValue);
      const dateB = parseDate(bValue);

      if (!dateA && !dateB) return 0;
      if (!dateA) return sortDirection === 'asc' ? 1 : -1;
      if (!dateB) return sortDirection === 'asc' ? -1 : 1;

      return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    }

    // Tratamento para outros tipos de dados
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    return 0;
  });

  const getUniqueColumnValues = (column) => {
    const values = new Set();
    data.forEach(row => {
      if (row[column]) {
        values.add(row[column]);
      }
    });
    return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
  };

  // Contagem de ordens de serviço em atraso
  const overdueCount = data.filter(row => isOverdueOrDueToday(row).isOverdue).length;

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownOpen && filterDropdownRefs.current[filterDropdownOpen] &&
          !filterDropdownRefs.current[filterDropdownOpen].contains(event.target) &&
          !event.target.closest('.filter-icon')) { // Evita fechar ao clicar no ícone
        setFilterDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownOpen]);

  // Função para exportar para Excel com cores e filtro de pendentes hoje
  const exportToExcel = useCallback(() => {
    if (data.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = data.filter(row => {
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row);
      return isOverdue || isDueToday;
    }).map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        // Formata a data para o Excel
        if (header === 'Data Limite') {
          newRow[header] = formatDataLimite(row[header]);
        } else if (header === 'Justificativa do Abono') {
          const { isOverdue, needsAbono } = isOverdueOrDueToday(row);
          newRow[header] = (isOverdue && needsAbono) ? 'FALTA ABONAR' : row[header];
        }
        else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Nenhum item pendente para hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Aplicar estilos de cor
    dataToExport.forEach((row, rowIndex) => {
      const originalRow = data.find(original =>
        original['Chamado'] === row['Chamado'] &&
        original['Numero Referencia'] === row['Numero Referencia']
      ); // Encontra a linha original para aplicar a lógica de cor
      if (!originalRow) return;

      const { isOverdue, isDueToday, needsAbono } = isOverdueOrDueToday(originalRow);

      let bgColor = '';
      let textColor = '000000'; // Preto padrão

      if (isOverdue) {
        bgColor = 'FF0000'; // Vermelho intenso
        textColor = 'FFFFFF'; // Branco
      } else if (isDueToday) {
        bgColor = 'FFFF00'; // Amarelo
        textColor = '000000'; // Preto
      }

      // Estilo para a célula "FALTA ABONAR" (roxo)
      if (needsAbono && originalRow['Justificativa do Abono'] === '') { // Apenas se a justificativa original estiver vazia
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: tableHeaders.indexOf('Justificativa do Abono') });
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = {
          fill: { fgColor: { rgb: '800080' } }, // Roxo
          font: { color: { rgb: 'FFFFFF' } }, // Branco
        };
      }

      // Aplicar cor de fundo e texto à linha inteira (se não for a célula "FALTA ABONAR")
      if (bgColor) {
        tableHeaders.forEach((header, colIndex) => {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
          if (!ws[cellRef]) ws[cellRef] = {};
          if (header !== 'Justificativa do Abono' || !needsAbono || originalRow['Justificativa do Abono'] !== '') {
             ws[cellRef].s = {
              fill: { fgColor: { rgb: bgColor } },
              font: { color: { rgb: textColor } },
            };
          }
        });
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Ordens_Servico_Pendentes_Hoje.xlsx');
  }, [data, tableHeaders, isOverdueOrDueToday, formatDataLimite]); // Removido filteredData e normalizeForComparison

  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-buttons">
          <div className="file-upload-container">
            <input
              type="file"
              id="file-upload"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar CSV'}
            </label>
            {selectedFile && (
              <button onClick={handleFileUpload} disabled={loading} className="upload-button">
                {loading ? 'Carregando...' : 'Processar CSV'}
              </button>
            )}
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
            Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            OSs em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      <div className="data-table-container">
        {loading && <p>Carregando dados...</p>}
        {!loading && data.length === 0 && !error && (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}
        {!loading && filteredData.length === 0 && data.length > 0 && (
          <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
        )}

        {!loading && filteredData.length > 0 && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span onClick={() => handleSort(header)} className="sortable-header">
                          {header} <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                        </span>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${columnFilters[header]?.length > 0 ? 'filter-active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {filterDropdownOpen === header && (
                          <div className="filter-dropdown" ref={el => filterDropdownRefs.current[header] = el}>
                            <div className="filter-options-container">
                              {getUniqueColumnValues(header).map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={columnFilters[header]?.includes(option) || false}
                                    onChange={(e) => handleFilterOptionChange(header, option, e.target.checked)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={() => applyFilter(header)}>Aplicar</button>
                              <button onClick={() => clearFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={getRowClass(row)}>
                    {tableHeaders.map((header) => (
                      <td key={header} className={getCellClass(row[header], header, row)}>
                        {formatCellValue(row[header], header, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
