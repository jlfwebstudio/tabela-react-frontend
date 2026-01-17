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
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
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
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Garante que a data seja interpretada como DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Verifica se a data é válida antes de formatar
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    return dateString; // Retorna original se não conseguir formatar
  }, []);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
      setSortColumn(null); // Reseta a ordenação
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
      if (result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
      } else {
        // Aplica o filtro permanente de status imediatamente após o carregamento
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(row.Status) === normalizeForComparison(status)
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}`);
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
      setSortDirection('asc');
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
      [column]: []
    }));
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
  }, []);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtrar por termo de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções de coluna selecionadas
    Object.keys(selectedFilterOptions).forEach(column => {
      const selectedOptions = selectedFilterOptions[column];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.some(option =>
            normalizeForComparison(row[column]) === normalizeForComparison(option)
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
          const parseDate = (dateString) => {
            if (!dateString) return new Date(0); // Datas vazias vão para o início
            const parts = dateString.split('/');
            if (parts.length === 3) {
              return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            }
            return new Date(0);
          };
          const dateA = parseDate(aValue);
          const dateB = parseDate(bValue);
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
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
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison]);

  // Contador de atrasos
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return filteredAndSortedData.filter(row => {
      const dateString = row['Data Limite'];
      if (!dateString) return false;

      const parts = dateString.split('/');
      if (parts.length === 3) {
        const rowDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        rowDate.setHours(0, 0, 0, 0);
        return rowDate < today;
      }
      return false;
    }).length;
  }, [filteredAndSortedData]);

  // Função para determinar a classe CSS da linha (cor)
  const getRowClass = useCallback((row) => {
    const dateString = row['Data Limite'];
    if (!dateString) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dateString.split('/');
    if (parts.length === 3) {
      const rowDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      rowDate.setHours(0, 0, 0, 0);

      if (rowDate < today) {
        return 'row-overdue'; // Vermelho intenso para atrasados
      } else if (rowDate.getTime() === today.getTime()) {
        return 'row-due-today'; // Amarelo para vencendo hoje
      }
    }
    return '';
  }, []);

  // Função para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const rowClass = getRowClass(row);
    const justificativaValue = row['Justificativa do Abono'];

    if (rowClass === 'row-overdue' && (!justificativaValue || normalizeForComparison(justificativaValue) === 'falta abonar')) {
      return { backgroundColor: '#800080', color: 'white' }; // Roxo intenso para "FALTA ABONAR"
    }
    return {};
  }, [getRowClass, normalizeForComparison]);

  // Função para obter o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const rowClass = getRowClass(row);
    const justificativaValue = row['Justificativa do Abono'];

    if (rowClass === 'row-overdue' && (!justificativaValue || normalizeForComparison(justificativaValue) === 'falta abonar')) {
      return 'FALTA ABONAR';
    }
    return justificativaValue;
  }, [getRowClass, normalizeForComparison]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredAndSortedData.filter(row => {
      const dateString = row['Data Limite'];
      if (!dateString) return false;

      const parts = dateString.split('/');
      if (parts.length === 3) {
        const rowDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        rowDate.setHours(0, 0, 0, 0);
        return rowDate <= today; // Atrasados e vencendo hoje
      }
      return false;
    });

    if (dataToExport.length === 0) {
      alert('Não há itens pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos
    const ws_colors = []; // Array para armazenar as cores das células

    dataToExport.forEach((row, rowIndex) => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Justificativa do Abono') {
          return getJustificativaCellText(row); // Usa o texto "FALTA ABONAR" se aplicável
        }
        // Formata CNPJ/CPF para garantir que seja tratado como texto no Excel
        if (header === 'CNPJ / CPF') {
          return String(row[header]).replace(/^="/, '').replace(/"$/, ''); // Remove =" e "
        }
        return row[header];
      });
      ws_data.push(rowData);

      // Cores para as linhas
      const rowClass = getRowClass(row);
      let rowBgColor = '';
      let rowTextColor = '';

      if (rowClass === 'row-overdue') {
        rowBgColor = '#C00000'; // Vermelho intenso
        rowTextColor = '#FFFFFF'; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = '#FFC000'; // Amarelo
        rowTextColor = '#000000'; // Preto
      }

      // Aplica a cor da linha a todas as células da linha
      const rowColors = rowData.map((_, colIndex) => {
        // Cor específica para a célula "Justificativa do Abono" se for "FALTA ABONAR"
        if (tableHeaders[colIndex] === 'Justificativa do Abono' && getJustificativaCellText(row) === 'FALTA ABONAR') {
          return { bg: '#800080', fg: '#FFFFFF' }; // Roxo intenso, texto branco
        }
        return { bg: rowBgColor, fg: rowTextColor };
      });
      ws_colors.push(rowColors);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica as cores às células
    for (let R = 0; R < ws_colors.length; R++) {
      for (let C = 0; C < ws_colors[R].length; C++) {
        const cellref = XLSX.utils.encode_cell({ r: R + 1, c: C }); // +1 porque a primeira linha é de cabeçalhos
        if (!ws[cellref]) ws[cellref] = {};
        if (ws_colors[R][C].bg) {
          ws[cellref].s = {
            fill: { fgColor: { rgb: ws_colors[R][C].bg.substring(1) } }, // Remove '#'
            font: { color: { rgb: ws_colors[R][C].fg.substring(1) } }, // Remove '#'
          };
        }
      }
    }

    // Ajusta a largura das colunas no Excel
    const wscols = tableHeaders.map(header => ({ wch: header.length + 5 })); // Largura baseada no cabeçalho
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'pendentes_hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, getRowClass, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Chamados</h1>
      </header>

      <div className="action-buttons-container">
        <div className="file-upload-section">
          <label htmlFor="file-upload" className="custom-file-upload">
            Selecionar Arquivo CSV
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <span className="file-name-display">
            {fileName || 'Nenhum arquivo selecionado'}
          </span>
          <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
            {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
          </button>
        </div>

        <div className="global-actions-section">
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
          <div className="overdue-count">
            Atrasos: {overdueCount}
          </div>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {data.length > 0 && (
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
                      <div className="filter-icon-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Evita que o clique no ícone feche o dropdown imediatamente
                            toggleFilterDropdown(header);
                          }}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {/* Opções de filtro dinâmicas */}
                              {Array.from(new Set(data.map(row => row[header])))
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
