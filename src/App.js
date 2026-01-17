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
    return dateString; // Retorna original se não for um formato DD/MM/YYYY válido
  }, []);

  // Função para parsear a data para comparação (YYYY-MM-DD)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10); // Mês já é 1-indexado aqui
      const year = parseInt(parts[2], 10);
      // Retorna no formato YYYY-MM-DD para comparação consistente
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
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

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
    } else {
      setFile(null);
      setFileName('');
    }
  };

  const handleUpload = async () => {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar o arquivo CSV.');
      }

      const result = await response.json();
      setData(result.data);
      // console.log("Dados recebidos do backend:", result.data); // Para depuração
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(err.message || 'Erro desconhecido ao fazer upload do arquivo.');
    } finally {
      setLoading(false);
    }
  };

  // Lógica de filtragem permanente por Status
  const filteredByStatusData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.filter(row => {
      const status = normalizeForComparison(row.Status);
      return allowedStatuses.some(allowedStatus => normalizeForComparison(allowedStatus) === status);
    });
  }, [data, allowedStatuses, normalizeForComparison]);

  // Lógica de pesquisa global
  const searchedData = useMemo(() => {
    if (!searchTerm) return filteredByStatusData;
    const normalizedSearchTerm = normalizeForComparison(searchTerm);
    return filteredByStatusData.filter(row =>
      tableHeaders.some(header =>
        normalizeForComparison(row[header]).includes(normalizedSearchTerm)
      )
    );
  }, [filteredByStatusData, searchTerm, tableHeaders, normalizeForComparison]);

  // Lógica de filtragem por coluna
  const filteredData = useMemo(() => {
    let currentFilteredData = searchedData;

    for (const header in selectedFilterOptions) {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentFilteredData = currentFilteredData.filter(row =>
          selectedOptions.includes(row[header])
        );
      }
    }
    return currentFilteredData;
  }, [searchedData, selectedFilterOptions]);

  // Lógica de ordenação
  const sortedData = useMemo(() => {
    if (!sortColumn || filteredData.length === 0) return filteredData;

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para Data Limite
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc'
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      }

      // Lógica de ordenação para outros tipos (string, number)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue))
          : normalizeForComparison(bValue).localeCompare(normalizeForComparison(aValue));
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison]);

  const filteredAndSortedData = sortedData; // Renomeado para clareza

  // Contador de atrasos
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return filteredAndSortedData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.split('/');
      if (parts.length !== 3) return false;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const dataLimite = new Date(year, month, day);
      dataLimite.setHours(0, 0, 0, 0);

      return dataLimite < today;
    }).length;
  }, [filteredAndSortedData]);

  const toggleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ao mudar de coluna
    }
  };

  const getSortIcon = (column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  };

  const toggleFilterDropdown = (header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  };

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

  const applyColumnFilter = () => {
    setOpenFilterDropdown(null); // Fecha o dropdown após aplicar
  };

  const clearColumnFilter = (header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: [] // Limpa as opções selecionadas para a coluna
    }));
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  };

  // Lógica para determinar a classe CSS da linha (cor de fundo)
  const getRowClass = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return 'row-default-blue'; // Default para linhas sem data

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return 'row-default-blue';

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const isDueToday = dataLimite.getTime() === today.getTime();
    const needsAbono = isOverdue && (!justificativa || justificativa.trim() === '' || normalizeForComparison(justificativa) === 'falta abonar');

    if (needsAbono) {
      return 'row-overdue'; // Linha vermelha intensa para atrasados, incluindo os que precisam de abono
    } else if (isOverdue) {
      return 'row-overdue'; // Linha vermelha intensa para atrasados
    } else if (isDueToday) {
      return 'row-due-today'; // Linha amarela para vencendo hoje
    } else {
      return 'row-default-blue'; // Linha azul claro para os demais
    }
  }, [normalizeForComparison]);

  // Lógica para determinar o estilo da célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return {};

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return {};

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0);

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
  }, [normalizeForComparison]);

  // Lógica para determinar o texto da célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return justificativa;

    const parts = dataLimiteStr.split('/');
    if (parts.length !== 3) return justificativa;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const dataLimite = new Date(year, month, day);
    dataLimite.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOverdue = dataLimite < today;
    const needsAbono = isOverdue && (!justificativa || justificativa.trim() === '' || normalizeForComparison(justificativa) === 'falta abonar');

    if (needsAbono) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [normalizeForComparison]);


  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingItems = filteredAndSortedData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.split('/');
      if (parts.length !== 3) return false;

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const dataLimite = new Date(year, month, day);
      dataLimite.setHours(0, 0, 0, 0);

      const isOverdue = dataLimite < today;
      const isDueToday = dataLimite.getTime() === today.getTime();

      return isOverdue || isDueToday;
    });

    if (pendingItems.length === 0) {
      alert('Não há itens pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos
    pendingItems.forEach(row => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Data Limite') {
          return formatDataLimite(row[header]);
        }
        if (header === 'Justificativa do Abono') {
          return getJustificativaCellText(row);
        }
        return row[header];
      });
      ws_data.push(rowData);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplicar estilos de cor
    pendingItems.forEach((row, index) => {
      const rowIndex = index + 1; // +1 para compensar o cabeçalho
      const rowClass = getRowClass(row);
      let bgColor = '#FFFFFF'; // Padrão branco

      if (rowClass === 'row-overdue') {
        bgColor = '#C00000'; // Vermelho intenso
      } else if (rowClass === 'row-due-today') {
        bgColor = '#FFC000'; // Amarelo
      } else if (rowClass === 'row-default-blue') {
        bgColor = '#E0F2F7'; // Azul claro
      }

      // Estilo para a linha inteira
      for (let i = 0; i < tableHeaders.length; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: i });
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = {
          fill: { fgColor: { rgb: bgColor.substring(1).toUpperCase() } },
          font: { color: { rgb: (rowClass === 'row-overdue' || rowClass === 'row-justificativa-abono') ? 'FFFFFF' : '333333' } }, // Texto branco para vermelho/roxo, escuro para outros
          alignment: { vertical: 'center', horizontal: 'left' },
          border: {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } },
          },
        };
      }

      // Estilo específico para a célula "Justificativa do Abono" se for "FALTA ABONAR"
      const justificativaHeaderIndex = tableHeaders.indexOf('Justificativa do Abono');
      if (justificativaHeaderIndex !== -1) {
        const justificativaText = getJustificativaCellText(row);
        if (justificativaText === 'FALTA ABONAR') {
          const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: justificativaHeaderIndex });
          if (!ws[cellRef]) ws[cellRef] = {};
          ws[cellRef].s = {
            ...ws[cellRef].s, // Mantém outros estilos da linha
            fill: { fgColor: { rgb: '800080' } }, // Roxo intenso
            font: { color: { rgb: 'FFFFFF' } }, // Texto branco
          };
        }
      }
    });

    // Estilo para os cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = {
        fill: { fgColor: { rgb: '4472C4' } }, // Azul escuro
        font: { color: { rgb: 'FFFFFF' }, bold: true }, // Texto branco e negrito
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: 'CCCCCC' } },
          bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
          left: { style: 'thin', color: { rgb: 'CCCCCC' } },
          right: { style: 'thin', color: { rgb: 'CCCCCC' } },
        },
      };
    });

    // Ajustar largura das colunas (exemplo, pode ser ajustado conforme necessário)
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
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

    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'Pendentes_Hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, getRowClass, getJustificativaCellText, formatDataLimite]);


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
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="header-content">
                      <span onClick={() => toggleSort(header)} className="sortable-header">
                        {header}
                        <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                      </span>
                      <div className="filter-wrapper">
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
                    </div>
                  </th>
                ))}
              </tr >
            </thead >
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
