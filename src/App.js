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
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
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
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str); // Garante que seja string
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  // Função para parsear datas no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
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
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    const isAbonarNeeded = isOverdue(row) && (!justificativa || justificativa.trim() === '');
    return isAbonarNeeded ? 'FALTA ABONAR' : justificativa;
  }, [isOverdue]);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    const isAbonarNeeded = isOverdue(row) && (!justificativa || justificativa.trim() === '');

    if (isAbonarNeeded) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isOverdue]);

  const handleFileChange = useCallback((event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]);
      setSortColumn('Data Limite');
      setSortDirection('asc');
      setSearchTerm('');
      setOpenFilterDropdown(null);
      // Ao selecionar novo arquivo, reseta os filtros para o padrão (os 5 status)
      setSelectedFilterOptions({
        'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
      });
    } else {
      setFile(null);
      setFileName('');
      setData([]);
    }
  }, []);

  const handleFileUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setData(result); // Os dados brutos são definidos aqui. O filtro de status será aplicado no useMemo filteredAndSortedData
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}. Verifique o console para mais detalhes.`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon')) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const getSortIcon = useCallback((column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  }, [sortColumn, sortDirection]);

  const getColumnFilterOptions = useCallback((header) => {
    const options = new Set();
    data.forEach(row => {
      if (row[header]) {
        options.add(row[header]);
      }
    });
    return Array.from(options).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
  }, [data, normalizeForComparison]);

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

  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null);
  }, []);

  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => {
      const newOptions = { ...prev };
      delete newOptions[column];
      return newOptions;
    });
    setOpenFilterDropdown(null);
  }, []);

  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Aplica filtros de coluna (incluindo o filtro padrão de Status)
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.some(option => normalizeForComparison(row[header]) === normalizeForComparison(option))
        );
      }
    });

    // 2. Aplica filtro de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 3. Aplica ordenação
    if (sortColumn) {
      currentData.sort((a, b) => {
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

        const valA = normalizeForComparison(aValue);
        const valB = normalizeForComparison(bValue);

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row)).length;
  }, [filteredAndSortedData, isOverdue]);

  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredAndSortedData.filter(row => {
      const limiteDate = parseDateForComparison(row['Data Limite']);
      return limiteDate && (limiteDate < today || limiteDate.getTime() === today.getTime());
    });

    if (dataToExport.length === 0) {
      alert('Não há dados pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data_with_styles = [];

    // Estilos base para células
    const baseBorderStyle = {
      top: { style: 'thin', color: { rgb: 'FFD3D3D3' } }, // Cinza claro
      bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
    };
    const baseFontStyle = { name: 'Calibri', sz: 11, color: { rgb: 'FF333333' } }; // Texto escuro padrão
    const baseAlignment = { vertical: 'center', horizontal: 'left' };

    // Estilo para cabeçalhos
    const headerStyle = {
      font: { ...baseFontStyle, bold: true, color: { rgb: 'FFFFFFFF' } }, // Branco, negrito
      fill: { fgColor: { rgb: 'FF2C3E50' } }, // Azul escuro do cabeçalho da web
      alignment: { vertical: 'center', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } }
      },
    };

    // Estilo para linhas atrasadas (vermelho)
    const overdueRowStyle = {
      font: { ...baseFontStyle, color: { rgb: 'FFFFFFFF' } }, // Texto branco
      fill: { fgColor: { rgb: 'FFC00000' } }, // Vermelho intenso
      alignment: baseAlignment,
      border: baseBorderStyle
    };

    // Estilo para linhas vencendo hoje (amarelo)
    const dueTodayRowStyle = {
      font: { ...baseFontStyle, color: { rgb: 'FF333333' } }, // Texto escuro
      fill: { fgColor: { rgb: 'FFFFC000' } }, // Amarelo
      alignment: baseAlignment,
      border: baseBorderStyle
    };

    // Estilo para linhas padrão (azul claro)
    const defaultBlueRowStyle = {
      font: { ...baseFontStyle, color: { rgb: 'FF333333' } }, // Texto escuro
      fill: { fgColor: { rgb: 'FFE0F2F7' } }, // Azul claro
      alignment: baseAlignment,
      border: baseBorderStyle
    };

    // Estilo para célula "FALTA ABONAR" (roxo)
    const faltaAbonarCellStyle = {
      font: { ...baseFontStyle, bold: true, color: { rgb: 'FFFFFFFF' } }, // Texto branco, negrito
      fill: { fgColor: { rgb: 'FF800080' } }, // Roxo intenso
      alignment: baseAlignment,
      border: baseBorderStyle
    };

    // Adiciona cabeçalhos com estilo
    const headerCells = tableHeaders.map(header => ({
      v: header.toUpperCase(),
      t: 's',
      s: headerStyle
    }));
    ws_data_with_styles.push(headerCells);

    // Adiciona as linhas de dados com estilos
    dataToExport.forEach(row => {
      const newRow = [];
      tableHeaders.forEach(header => {
        let cellValue = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
        let currentCellStyle = { ...defaultBlueRowStyle }; // Começa com o estilo azul claro padrão

        // Determina o estilo da linha
        if (isOverdue(row)) {
          currentCellStyle = { ...overdueRowStyle };
        } else if (isDueToday(row)) {
          currentCellStyle = { ...dueTodayRowStyle };
        }

        // Sobrescreve para a célula "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && getJustificativaCellText(row) === 'FALTA ABONAR') {
          cellValue = 'FALTA ABONAR';
          currentCellStyle = { ...faltaAbonarCellStyle };
        }

        // Formatação de data para a coluna 'Data Limite'
        if (header === 'Data Limite') {
          const dateValue = parseDateForComparison(row[header]);
          if (dateValue && !isNaN(dateValue)) {
            cellValue = dateValue; // Valor como objeto Date
            currentCellStyle.t = 'd'; // Tipo data
            currentCellStyle.z = 'DD/MM/YYYY'; // Formato de exibição
          } else {
            currentCellStyle.t = 's'; // Se inválido, trata como string
            cellValue = row[header];
          }
        } else if (header === 'CNPJ / CPF') {
          currentCellStyle.t = 's'; // Força como texto
          currentCellStyle.z = '@'; // Formato de texto
          cellValue = String(row[header]);
        } else {
          currentCellStyle.t = 's'; // Default para string
        }

        newRow.push({ v: cellValue, t: currentCellStyle.t || 's', s: currentCellStyle });
      });
      ws_data_with_styles.push(newRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data_with_styles);

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 15; break;
        case 'Numero Referencia': width = 20; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 20; break;
        case 'Data Limite': width = 18; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 25; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 40; break;
        default: width = 20; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'pendencias_hoje.xlsx');
  }, [data, filteredAndSortedData, tableHeaders, isOverdue, isDueToday, parseDateForComparison, formatDataLimite, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
      </header>

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
              placeholder="Pesquisar na tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => handleSort(header)} className="sortable-header">
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
                      </span>
                      <div className="filter-container" ref={openFilterDropdown === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${selectedFilterOptions[header]?.length > 0 ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => String(row[header] || ''))))
                                .filter(option => option !== null && option !== undefined && String(option).trim() !== '')
                                .sort((a, b) => String(a).localeCompare(String(b)))
                                .map(option => (
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
