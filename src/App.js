// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faFilter, faTimesCircle } from '@fortawesome/free-solid-svg-icons';
import './App.css';

const App = () => {
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const filterDropdownRef = useRef(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela - Ordem e nomes exatos esperados
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

  // Status permitidos para exibição
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função auxiliar para normalizar strings para comparação (sem acentos, maiúsculas)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Espera DD/MM/YYYY ou YYYY-MM-DD
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Assume DD/MM/YYYY
      const [day, month, year] = parts;
      return `${day}/${month}/${year}`;
    }
    // Se for YYYY-MM-DD ou outro formato, tenta criar um objeto Date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Retorna original se inválido
    }
    return date.toLocaleDateString('pt-BR');
  }, []);

  // Função para verificar se a OS está atrasada ou vence hoje
  const isOverdueOrDueToday = useCallback((dateString, status) => {
    if (!dateString || !status) return { isOverdue: false, isDueToday: false };

    // Converte a data string (DD/MM/YYYY) para um formato consistente (YYYY-MM-DD) para new Date()
    const parts = dateString.split('/');
    if (parts.length !== 3) {
      return { isOverdue: false, isDueToday: false }; // Formato inválido
    }
    const [day, month, year] = parts;
    const formattedDate = `${year}-${month}-${day}`; // YYYY-MM-DD

    const limitDate = new Date(formattedDate + 'T23:59:59'); // Fim do dia limite
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Começo do dia de hoje

    const normalizedStatus = normalizeForComparison(status);

    // Se o status for um dos "finalizados", não é atrasado nem vence hoje
    if (normalizedStatus === 'FINALIZADA' || normalizedStatus === 'CANCELADA') {
      return { isOverdue: false, isDueToday: false };
    }

    // Compara apenas a data, ignorando a hora
    const limitDateOnly = new Date(limitDate);
    limitDateOnly.setHours(0, 0, 0, 0);

    const isOverdue = limitDateOnly.getTime() < today.getTime();
    const isDueToday = limitDateOnly.getTime() === today.getTime();

    return { isOverdue, isDueToday };
  }, [normalizeForComparison]);

  // Função para determinar a classe da linha (cor)
  const getRowClass = useCallback((rowData) => {
    const { isOverdue, isDueToday } = isOverdueOrDueToday(rowData['Data Limite'], rowData['Status']);
    const justificativa = normalizeForComparison(rowData['Justificativa do Abono']);

    if (isOverdue) {
      // Se está atrasada E a justificativa está vazia, é "FALTA ABONAR"
      if (justificativa === '' || justificativa === 'FALTA ABONAR') {
        return 'overdue-strong falta-abonar-row'; // Vermelho forte para a linha, e classe para a célula
      }
      return 'overdue-strong'; // Vermelho forte para a linha
    }
    if (isDueToday) {
      return 'due-today'; // Amarelo para vencendo hoje
    }
    return '';
  }, [isOverdueOrDueToday, normalizeForComparison]);

  // Função para formatar o valor da célula, incluindo "FALTA ABONAR"
  const formatCellValue = useCallback((header, value, rowData) => {
    if (header === 'Data Limite') {
      return formatDataLimite(value);
    }
    if (header === 'Justificativa do Abono') {
      const { isOverdue } = isOverdueOrDueToday(rowData['Data Limite'], rowData['Status']);
      const justificativa = normalizeForComparison(value);
      if (isOverdue && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
        return 'FALTA ABONAR';
      }
    }
    return value;
  }, [formatDataLimite, isOverdueOrDueToday, normalizeForComparison]);

  // Função para obter a classe da célula (para "FALTA ABONAR")
  const getCellClass = useCallback((header, value, rowData) => {
    if (header === 'Justificativa do Abono') {
      const { isOverdue } = isOverdueOrDueToday(rowData['Data Limite'], rowData['Status']);
      const justificativa = normalizeForComparison(value);
      if (isOverdue && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
        return 'falta-abonar-cell'; // Aplica a classe roxa à célula
      }
    }
    return '';
  }, [isOverdueOrDueToday, normalizeForComparison]);

  // Processa os dados brutos para aplicar filtros de status e normalização
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.filter(row => {
      const status = normalizeForComparison(row['Status']);
      // Filtro de status permanente
      return allowedStatuses.includes(status);
    });
  }, [data, allowedStatuses, normalizeForComparison]);

  // Aplica filtros de coluna
  const filteredData = useMemo(() => {
    if (!processedData || processedData.length === 0) return [];

    return processedData.filter(row => {
      return tableHeaders.every(header => {
        if (!columnFilters[header] || columnFilters[header].length === 0) {
          return true; // Sem filtro para esta coluna
        }
        const cellValue = normalizeForComparison(row[header]);
        return columnFilters[header].some(filterValue => normalizeForComparison(filterValue) === cellValue);
      });
    });
  }, [processedData, columnFilters, tableHeaders, normalizeForComparison]);

  // Aplica ordenação
  const sortedData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    if (!sortColumn) return filteredData;

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para datas
      if (sortColumn === 'Data Limite') {
        const parseDate = (dateString) => {
          if (!dateString) return new Date(0); // Retorna uma data muito antiga para valores vazios
          const parts = dateString.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            return new Date(`${year}-${month}-${day}`);
          }
          return new Date(dateString); // Tenta parsear outros formatos
        };
        const dateA = parseDate(aValue);
        const dateB = parseDate(bValue);
        return (dateA.getTime() - dateB.getTime()) * (sortDirection === 'asc' ? 1 : -1);
      }

      // Lógica de ordenação padrão para strings e números
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * (sortDirection === 'asc' ? 1 : -1);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * (sortDirection === 'asc' ? 1 : -1);
      }
      // Fallback para outros tipos ou valores mistos
      return String(aValue).localeCompare(String(bValue)) * (sortDirection === 'asc' ? 1 : -1);
    });
    return sorted;
  }, [filteredData, sortColumn, sortDirection]);

  // Contagem de ordens de serviço em atraso
  const overdueCount = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return 0;
    return filteredData.filter(row => {
      const { isOverdue } = isOverdueOrDueToday(row['Data Limite'], row['Status']);
      return isOverdue;
    }).length;
  }, [filteredData, isOverdueOrDueToday]);

  // Lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Lidar com a ordenação da tabela
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Lidar com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = (header) => {
    setFilterDropdownOpen(filterDropdownOpen === header ? null : header);
  };

  // Lidar com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((header, option, isChecked) => {
    setColumnFilters(prevFilters => {
      const currentFilters = prevFilters[header] || [];
      if (isChecked) {
        return { ...prevFilters, [header]: [...currentFilters, option] };
      } else {
        return { ...prevFilters, [header]: currentFilters.filter(item => item !== option) };
      }
    });
  }, []);

  // Aplicar filtros
  const applyFilters = useCallback(() => {
    setFilterDropdownOpen(null); // Fecha o dropdown
  }, []);

  // Limpar filtros de uma coluna específica
  const clearColumnFilters = useCallback((header) => {
    setColumnFilters(prevFilters => ({
      ...prevFilters,
      [header]: [],
    }));
  }, []);

  // Limpar todos os filtros
  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
  }, []);

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setFilterDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (sortedData.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    // Filtra apenas os itens pendentes de hoje (atrasados e vencendo hoje)
    const pendingTodayData = sortedData.filter(row => {
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite'], row['Status']);
      return isOverdue || isDueToday;
    });

    if (pendingTodayData.length === 0) {
      alert('Nenhum item pendente para hoje para exportar.');
      return;
    }

    const ws_data = [tableHeaders]; // Adiciona os cabeçalhos

    pendingTodayData.forEach(row => {
      const rowValues = tableHeaders.map(header => {
        // Usa formatCellValue para obter o texto correto, incluindo "FALTA ABONAR"
        return formatCellValue(header, row[header], row);
      });
      ws_data.push(rowValues);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica cores às células no Excel
    pendingTodayData.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 2; // +1 para cabeçalho, +1 para 0-indexed para 1-indexed
      const { isOverdue, isDueToday } = isOverdueOrDueToday(row['Data Limite'], row['Status']);
      const justificativa = normalizeForComparison(row['Justificativa do Abono']);

      let fillColor = '';
      let fontColor = 'FF000000'; // Preto padrão

      if (isOverdue) {
        fillColor = 'FFFF0000'; // Vermelho intenso para atrasados
        fontColor = 'FFFFFFFF'; // Texto branco
      } else if (isDueToday) {
        fillColor = 'FFFFFF00'; // Amarelo para vencendo hoje
        fontColor = 'FF000000'; // Texto preto
      }

      // Se for "FALTA ABONAR", aplica roxo à célula de justificativa
      if (isOverdue && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
        const justificativaColIndex = tableHeaders.indexOf('Justificativa do Abono');
        if (justificativaColIndex !== -1) {
          const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex -1, c: justificativaColIndex }); // rowIndex é 0-indexed, excel é 1-indexed
          if (!ws[cellRef]) ws[cellRef] = {};
          if (!ws[cellRef].s) ws[cellRef].s = {};
          ws[cellRef].s.fill = { fgColor: { rgb: 'FF800080' } }; // Roxo para a célula
          ws[cellRef].s.font = { color: { rgb: 'FFFFFFFF' }, bold: true }; // Texto branco e negrito
        }
      }

      // Aplica a cor de fundo da linha (se não for "FALTA ABONAR" na célula)
      if (fillColor) {
        tableHeaders.forEach((_, colIndex) => {
          const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex -1, c: colIndex });
          if (!ws[cellRef]) ws[cellRef] = {};
          if (!ws[cellRef].s) ws[cellRef].s = {};
          ws[cellRef].s.fill = { fgColor: { rgb: fillColor } };
          ws[cellRef].s.font = { color: { rgb: fontColor } };
        });
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [sortedData, tableHeaders, isOverdueOrDueToday, normalizeForComparison, formatCellValue]); // Removidas filteredData e normalizeForComparison

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {loading && <p>Carregando...</p>}
          {error && <p className="error-message">{error}</p>}
        </div>
        <div className="action-buttons">
          <div className="overdue-count">
            Ordens de Serviço em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
          <button onClick={exportToExcel} className="export-button">
            Exportar Pendentes Hoje (Excel)
          </button>
        </div>
      </header>

      <main className="data-table-container">
        {sortedData.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className={`col-${normalizeForComparison(header).replace(/ /g, '-').replace(/\//g, '\\/')}`}>
                      <div className="header-content">
                        <span className="sortable-header" onClick={() => handleSort(header)}>
                          {header}
                          {sortColumn === header && (
                            <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                          )}
                          {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon" />}
                        </span>
                        <div className="filter-controls">
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={`filter-icon ${columnFilters[header] && columnFilters[header].length > 0 ? 'filter-active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation(); // Evita que o clique no ícone de filtro também ordene
                              toggleFilterDropdown(header);
                            }}
                          />
                          {filterDropdownOpen === header && (
                            <div className="filter-dropdown" ref={filterDropdownRef}>
                              <div className="filter-options-container">
                                {Array.from(new Set(processedData.map(row => row[header])))
                                  .filter(Boolean) // Remove valores nulos/vazios
                                  .sort((a, b) => String(a).localeCompare(String(b)))
                                  .map((option) => (
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
                                <button onClick={() => applyFilters()}>Aplicar</button>
                                <button onClick={() => clearColumnFilters(header)}>Limpar</button>
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
                {sortedData.length > 0 ? (
                  sortedData.map((row, rowIndex) => (
                    <tr key={rowIndex} className={getRowClass(row)}>
                      {tableHeaders.map((header) => (
                        <td key={header} className={getCellClass(header, row[header], row)}>
                          {formatCellValue(header, row[header], row)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableHeaders.length} className="no-data-message">
                      Nenhum dado corresponde aos filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}
      </main>
    </div>
  );
};

export default App;
