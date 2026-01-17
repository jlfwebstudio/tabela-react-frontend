// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Inicializa com 'Data Limite'
  const [sortDirection, setSortDirection] = useState('asc'); // Inicializa com 'asc' (mais antigo para mais novo)
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null); // Coluna do filtro aberto
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
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

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função utilitária para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' || str === null || str === undefined) return ''; // CORREÇÃO: Adicionado undefined
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
      }
    }
    return dateString; // Retorna original se não for um formato DD/MM/YYYY válido
  }, []);

  // Função para parsear a data para comparação (retorna objeto Date)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  }, []);

  // Lógica para determinar a classe CSS da linha (cor)
  const getRowClass = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) {
      return 'row-default-blue';
    }

    const dataLimite = parseDateForComparison(dataLimiteStr);
    if (!dataLimite) {
      return 'row-default-blue';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const isDueToday = dataLimite.getTime() === today.getTime();

    const isFaltaAbonar = isOverdue && (!justificativa || normalizeForComparison(justificativa) === 'falta abonar');

    if (isFaltaAbonar) {
      return 'row-overdue';
    } else if (isOverdue) {
      return 'row-overdue';
    } else if (isDueToday) {
      return 'row-due-today';
    }

    return 'row-default-blue';
  }, [parseDateForComparison, normalizeForComparison]);

  // Lógica para determinar o estilo da célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return {};

    const dataLimite = parseDateForComparison(dataLimiteStr);
    if (!dataLimite) return {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const needsAbono = isOverdue && (!justificativa || justificativa.trim() === '' || normalizeForComparison(justificativa) === 'falta abonar');

    if (needsAbono) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF',           // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, [parseDateForComparison, normalizeForComparison]);

  // Lógica para determinar o texto da célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return justificativa || '';

    const dataLimite = parseDateForComparison(dataLimiteStr);
    if (!dataLimite) return justificativa || '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const needsAbono = isOverdue && (!justificativa || justificativa.trim() === '' || normalizeForComparison(justificativa) === 'falta abonar');

    if (needsAbono) {
      return 'FALTA ABONAR';
    }
    return justificativa || '';
  }, [parseDateForComparison, normalizeForComparison]);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
      setSortColumn('Data Limite'); // Reseta a ordenação para o padrão
      setSortDirection('asc');
      setSearchTerm(''); // Reseta a pesquisa
      setOpenFilterDropdown(null); // Fecha qualquer dropdown de filtro
      setSelectedFilterOptions({}); // Reseta os filtros de coluna
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para processar o upload do CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados antes de um novo upload

    const formData = new FormData();
    formData.append('file', file);

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
      // CORREÇÃO: Verifica se result é um array antes de acessar .length
      if (!Array.isArray(result) || result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
        setData([]); // Garante que data esteja vazia
      } else {
        // Aplica o filtro permanente de status imediatamente após o carregamento
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(row.Status || '') === normalizeForComparison(status) // CORREÇÃO: Garante que row.Status não seja undefined
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses, normalizeForComparison]);

  // Lógica de ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ao mudar de coluna
    }
  }, [sortColumn, sortDirection]);

  // Função para obter o ícone de ordenação
  const getSortIcon = useCallback((column) => {
    if (sortColumn !== column) {
      return <FontAwesomeIcon icon={faSort} />;
    }
    if (sortDirection === 'asc') {
      return <FontAwesomeIcon icon={faSortUp} />;
    }
    return <FontAwesomeIcon icon={faSortDown} />;
  }, [sortColumn, sortDirection]);

  // Lógica de filtragem de coluna
  const toggleFilterDropdown = useCallback((column) => {
    setOpenFilterDropdown(openFilterDropdown === column ? null : column);
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
      [column]: [] // Limpa as opções selecionadas para a coluna
    }));
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon-container')) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openFilterDropdown]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtrar por termo de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header] || '').includes(normalizedSearchTerm) // CORREÇÃO: Garante que row[header] não seja undefined
        )
      );
    }

    // 2. Filtrar por opções de coluna selecionadas
    Object.keys(selectedFilterOptions).forEach(column => {
      const selectedOptions = selectedFilterOptions[column];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.some(option =>
            normalizeForComparison(row[column] || '') === normalizeForComparison(option) // CORREÇÃO: Garante que row[column] não seja undefined
          )
        );
      }
    });

    // 3. Ordenar
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica para ordenar datas
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Lógica para ordenar strings e números
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
            : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Contador de atrasos
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return filteredAndSortedData.filter(row => {
      const dateString = row['Data Limite'];
      if (!dateString) return false;

      const rowDate = parseDateForComparison(dateString);
      if (!rowDate) return false;

      return rowDate < today;
    }).length;
  }, [filteredAndSortedData, parseDateForComparison]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingItems = filteredAndSortedData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const dataLimite = parseDateForComparison(dataLimiteStr);
      if (!dataLimite) return false;

      const isOverdue = dataLimite < today;
      const isDueToday = dataLimite.getTime() === today.getTime();

      return isOverdue || isDueToday;
    });

    if (pendingItems.length === 0) {
      alert('Não há itens pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos
    const ws_colors = []; // Array para armazenar as cores das células

    pendingItems.forEach((row, rowIndex) => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Justificativa do Abono') {
          return getJustificativaCellText(row);
        }
        if (header === 'Data Limite') {
          return formatDataLimite(row[header]);
        }
        if (header === 'CNPJ / CPF') {
          return String(row[header] || '').replace(/^="/, '').replace(/"$/, ''); // CORREÇÃO: Garante que row[header] não seja undefined
        }
        return row[header] || ''; // CORREÇÃO: Garante que o valor seja string vazia se undefined
      });
      ws_data.push(rowData);

      const rowClass = getRowClass(row);
      let rowBgColor = '';
      let rowTextColor = '';

      if (rowClass === 'row-overdue') {
        rowBgColor = '#C00000';
        rowTextColor = '#FFFFFF';
      } else if (rowClass === 'row-due-today') {
        rowBgColor = '#FFC000';
        rowTextColor = '#000000';
      } else if (rowClass === 'row-default-blue') {
        rowBgColor = '#E0F2F7';
        rowTextColor = '#333333';
      }

      const rowColors = rowData.map((_, colIndex) => {
        if (tableHeaders[colIndex] === 'Justificativa do Abono' && getJustificativaCellText(row) === 'FALTA ABONAR') {
          return { bg: '#800080', fg: '#FFFFFF' };
        }
        return { bg: rowBgColor, fg: rowTextColor };
      });
      ws_colors.push(rowColors);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    for (let R = 0; R < ws_colors.length; R++) {
      for (let C = 0; C < ws_colors[R].length; C++) {
        const cellref = XLSX.utils.encode_cell({ r: R + 1, c: C });
        if (!ws[cellref]) ws[cellref] = {};
        if (ws_colors[R][C].bg) {
          ws[cellref].s = {
            fill: { fgColor: { rgb: ws_colors[R][C].bg.substring(1).toUpperCase() } },
            font: { color: { rgb: ws_colors[R][C].fg.substring(1).toUpperCase() } },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: {
              top: { style: 'thin', color: { rgb: 'CCCCCC' } },
              bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
              left: { style: 'thin', color: { rgb: 'CCCCCC' } },
              right: { style: 'thin', color: { rgb: 'CCCCCC' } },
            },
          };
        }
      }
    }

    const wscols = tableHeaders.map(header => {
      let width = 15;
      if (header === 'Chamado') width = 12;
      if (header === 'Numero Referencia') width = 15;
      if (header === 'Contratante') width = 20;
      if (header === 'Serviço') width = 25;
      if (header === 'Status') width = 18;
      if (header === 'Data Limite') width = 15;
      if (header === 'Cliente') width = 25;
      if (header === 'CNPJ / CPF') width = 20;
      if (header === 'Cidade') width = 18;
      if (header === 'Técnico') width = 25;
      if (header === 'Prestador') width = 20;
      if (header === 'Justificativa do Abono') width = 35;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'Pendentes_Hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, getRowClass, getJustificativaCellText, formatDataLimite, parseDateForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Chamados</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName || 'Selecionar Arquivo CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              Atrasos: {overdueCount}
            </div>
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              Exportar Pendentes Hoje (Excel)
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {loading && data.length === 0 && <p className="loading-message">Carregando dados...</p>}
      {!loading && data.length === 0 && !error && (
        <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
      )}
      {!loading && data.length > 0 && filteredAndSortedData.length === 0 && (
        <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
      )}

      {data.length > 0 && filteredAndSortedData.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="header-content">
                      <span onClick={() => handleSort(header)} className="sortable-header">
                        {header} {getSortIcon(header)}
                      </span>
                      <div className="filter-wrapper">
                        <div className="filter-icon-container">
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFilterDropdown(header);
                            }}
                          />
                          {openFilterDropdown === header && (
                            <div className="filter-dropdown" ref={filterDropdownRef}>
                              <div className="filter-options-container">
                                {Array.from(new Set(data.map(row => row[header])))
                                  .filter(option => option !== undefined && option !== null && option !== '') // Filtra valores vazios
                                  .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                  .map(option => (
                                    <label key={option} className="filter-option">
                                      <input
                                        type="checkbox"
                                        checked={selectedFilterOptions[header]?.includes(option) || false}
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
