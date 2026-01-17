import React, { useState, useEffect, useCallback, useMemo } from 'react';
// eslint-disable-next-line no-unused-vars
import { useRef } from 'react'; // Mantido para caso de uso futuro, mas desabilitado o linting
import * as XLSX from 'xlsx';
// eslint-disable-next-line no-unused-vars
import { saveAs } from 'file-saver'; // Não é mais usado diretamente, mas mantido para referência

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Coluna padrão para ordenação
  const [sortDirection, setSortDirection] = useState('asc'); // Direção padrão: crescente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterDropdown, setActiveFilterDropdown] = useState(null);

  // Referência para o dropdown de filtro para fechar ao clicar fora
  const filterDropdownRef = useRef(null);

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços extras)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // eslint-disable-next-line no-unused-vars
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (isNaN(date)) return dateString; // Retorna original se for inválido
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isOverdue = useCallback((dateString) => {
    if (!dateString) return false;
    const limitDate = parseDateForComparison(dateString);
    if (isNaN(limitDate)) return false;
    return limitDate < today;
  }, [parseDateForComparison, today]);

  const isDueToday = useCallback((dateString) => {
    if (!dateString) return false;
    const limitDate = parseDateForComparison(dateString);
    if (isNaN(limitDate)) return false;
    return limitDate.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar'; // Verifica se é "FALTA ABONAR"

    if (isOverdue(row['Data Limite'])) {
      return 'row-overdue';
    } else if (isDueToday(row['Data Limite'])) {
      return 'row-due-today';
    } else {
      return 'row-default-blue';
    }
  }, [isOverdue, isDueToday, normalizeForComparison]);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar'; // Verifica se é "FALTA ABONAR"

    if (isAbonar && isOverdue(row['Data Limite'])) { // Aplica roxo apenas se estiver atrasado E for "FALTA ABONAR"
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [normalizeForComparison, isOverdue]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar'; // Verifica se é "FALTA ABONAR"

    if (isAbonar && isOverdue(row['Data Limite'])) { // Exibe "FALTA ABONAR" apenas se estiver atrasado E for "FALTA ABONAR"
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [normalizeForComparison, isOverdue]);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
    setError('');
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      if (result.length > 0) {
        setTableHeaders(Object.keys(result[0]));
        setData(result);
        // Resetar filtros para o padrão após novo upload
        setSelectedFilterOptions({
          'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
        });
        setSortColumn('Data Limite');
        setSortDirection('asc');
        setSearchTerm('');
      } else {
        setData([]);
        setTableHeaders([]);
        setError('O arquivo CSV está vazio ou não contém dados válidos.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message}. Verifique o console para mais detalhes.`);
      setData([]);
      setTableHeaders([]);
    } finally {
      setLoading(false);
    }
  };

  // Efeito para gerar opções de filtro quando os dados mudam
  useEffect(() => {
    if (data.length > 0 && tableHeaders.length > 0) {
      const newFilterOptions = {};
      tableHeaders.forEach(header => {
        const options = [...new Set(data.map(row => row[header]))].sort((a, b) => {
          if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
          }
          return 0;
        });
        newFilterOptions[header] = options;
      });
      setFilterOptions(newFilterOptions);
    }
  }, [data, tableHeaders]);

  // Lógica de ordenação
  const sortData = useCallback((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];

    if (sortColumn === 'Data Limite') {
      const dateA = parseDateForComparison(aValue);
      const dateB = parseDateForComparison(bValue);
      if (dateA && dateB) {
        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }
      return 0;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    return 0;
  }, [sortColumn, sortDirection, parseDateForComparison]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Aplica filtros de coluna (incluindo o filtro padrão de Status)
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.some(option => normalizeForComparison(option) === normalizeForComparison(row[header]))
        );
      }
    });

    // 2. Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm); // eslint-disable-line no-unused-vars
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 3. Ordena os dados
    currentData.sort(sortData);

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, tableHeaders, sortData, normalizeForComparison]);


  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row['Data Limite'])).length;
  }, [filteredAndSortedData, isOverdue]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleFilterDropdown = (header) => {
    setActiveFilterDropdown(activeFilterDropdown === header ? null : header);
  };

  const handleFilterOptionChange = (header, option, isChecked) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (isChecked) {
        return { ...prev, [header]: [...currentOptions, option] };
      } else {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      }
    });
  };

  const applyColumnFilter = () => {
    setActiveFilterDropdown(null); // Fecha o dropdown após aplicar
  };

  const clearColumnFilter = (header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
    setActiveFilterDropdown(null); // Fecha o dropdown após limpar
  };

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para exportar para Excel com estilos
  const exportToExcel = useCallback(() => { // eslint-disable-line react-hooks/exhaustive-deps
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const todayFormatted = today.toLocaleDateString('pt-BR');

    // Filtra apenas os itens atrasados e vencendo hoje para a exportação
    const dataToExport = filteredAndSortedData.filter(row =>
      isOverdue(row['Data Limite']) || isDueToday(row['Data Limite'])
    ).map(row => {
      // Mapeia os dados para o formato que será exportado, aplicando formatação de data
      const newRow = { ...row };
      newRow['Data Limite'] = formatDataLimite(row['Data Limite']);
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há pendências (atrasadas ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Definir larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      else if (header === 'Justificativa do Abono') width = 40;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    // Estilos para células de dados
    const defaultCellStyle = {
      font: { color: { rgb: "FF000000" } }, // Texto preto padrão
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    const overdueCellStyle = {
      fill: { fgColor: { rgb: "FFC00000" } }, // Vermelho intenso
      font: { color: { rgb: "FFFFFFFF" } }, // Texto branco
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    const dueTodayCellStyle = {
      fill: { fgColor: { rgb: "FFFFC000" } }, // Amarelo
      font: { color: { rgb: "FF000000" } }, // Texto preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    const defaultBlueCellStyle = {
      fill: { fgColor: { rgb: "FFE0F2F7" } }, // Azul claro suave
      font: { color: { rgb: "FF000000" } }, // Texto preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    const faltaAbonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } },
      }
    };

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos às células de dados
    for (let R = 0; R < dataToExport.length; ++R) {
      const originalRow = filteredAndSortedData.find(r =>
        r['Chamado'] === dataToExport[R]['Chamado'] &&
        r['Data Limite'] === dataToExport[R]['Data Limite']
      ); // Encontra a linha original para verificar status

      const isRowOverdue = isOverdue(originalRow['Data Limite']);
      const isRowDueToday = isDueToday(originalRow['Data Limite']);
      const justificativa = normalizeForComparison(originalRow['Justificativa do Abono']);
      const isFaltaAbonar = justificativa === 'falta abonar';

      for (let C = 0; C < tableHeaders.length; ++C) {
        const header = tableHeaders[C];
        const cellRef = XLSX.utils.encode_cell({ r: R + 1, c: C }); // +1 para pular o cabeçalho
        if (!ws[cellRef]) ws[cellRef] = { v: dataToExport[R][header] }; // Garante que a célula exista

        let cellStyle = { ...defaultCellStyle }; // Começa com o estilo padrão

        if (header === 'Justificativa do Abono' && isFaltaAbonar && isRowOverdue) {
          cellStyle = { ...faltaAbonarCellStyle };
          ws[cellRef].v = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR"
        } else if (isRowOverdue) {
          cellStyle = { ...overdueCellStyle };
        } else if (isRowDueToday) {
          cellStyle = { ...dueTodayCellStyle };
        } else {
          cellStyle = { ...defaultBlueCellStyle };
        }

        // Formatação específica para CNPJ / CPF como texto
        if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Define o tipo da célula como string
          ws[cellRef].v = String(dataToExport[R][header]); // Garante que o valor seja string
        } else if (header === 'Data Limite') {
          // As datas já estão formatadas como string "DD/MM/YYYY" pelo .map acima
          ws[cellRef].t = 's'; // Define o tipo da célula como string
        }

        ws[cellRef].s = cellStyle;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
    XLSX.writeFile(wb, `Pendencias_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite, normalizeForComparison, today]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
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
            <button onClick={exportToExcel} className="export-button">
              Exportar Pendentes Hoje (Excel)
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
                      <div className="table-header" onClick={() => handleSort(header)}>
                        {header}
                        <div className="sort-icons">
                          <FontAwesomeIcon icon={faSortUp} className={sortColumn === header && sortDirection === 'asc' ? 'sort-icon active' : 'sort-icon'} />
                          <FontAwesomeIcon icon={faSortDown} className={sortColumn === header && sortDirection === 'desc' ? 'sort-icon active' : 'sort-icon'} />
                        </div>
                      </div>
                      <div className="filter-container" ref={filterDropdownRef}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterDropdown === header ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Evita que o clique no ícone feche o dropdown imediatamente
                            toggleFilterDropdown(header);
                          }}
                        />
                        {activeFilterDropdown === header && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}> {/* Evita fechar ao clicar dentro */}
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedFilterOptions[header]?.includes(option) || false}
                                    onChange={(e) => handleFilterOptionChange(header, option, e.target.checked)}
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
