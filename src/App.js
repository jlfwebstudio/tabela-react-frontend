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
  ], []); // Dependência vazia, pois os cabeçalhos são fixos

  // eslint-disable-next-line react-hooks/exhaustive-deps, no-unused-vars
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Retorna um objeto Date no formato YYYY-MM-DD para comparação consistente
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return null;
  }, []); // Sem dependências, pois é uma função pura

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      // Formata para DD/MM/YYYY
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    return dateString; // Retorna o original se não for uma data válida
  }, [parseDateForComparison]);

  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return dataLimite < today;
  }, [parseDateForComparison]);

  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue'; // Nova classe para linhas padrão
  }, [isOverdue, isDueToday]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    if (justificativa && justificativa.trim().toUpperCase() === 'FALTA ABONAR') {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, []);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = row['Justificativa do Abono'];
    if (justificativa && justificativa.trim().toUpperCase() === 'FALTA ABONAR') {
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

  const processCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
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
        // Tenta ler a resposta como texto para depuração se não for JSON
        const errorText = await response.text();
        throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Erro ao processar CSV:', err);
      setError(`Erro ao carregar ou processar o arquivo: ${err.message}. Verifique o console para mais detalhes.`);
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

  const normalizeForComparison = useCallback((value) => {
    if (value === null || value === undefined) return '';
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  const sortData = useCallback((a, b) => {
    const valA = a[sortColumn];
    const valB = b[sortColumn];

    if (sortColumn === 'Data Limite') {
      const dateA = parseDateForComparison(valA);
      const dateB = parseDateForComparison(valB);

      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
      if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

      return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    }

    // Para outros tipos de coluna, faça uma comparação de string robusta
    const normalizedA = normalizeForComparison(valA);
    const normalizedB = normalizeForComparison(valB);

    if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
    if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  }, [sortColumn, sortDirection, parseDateForComparison, normalizeForComparison]);

  const getColumnFilterOptions = useCallback((header) => {
    const options = new Set();
    data.forEach(row => {
      if (row[header]) {
        options.add(row[header]);
      }
    });
    return Array.from(options).sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
  }, [data, normalizeForComparison]);

  const handleFilterOptionChange = (header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] ? [...prev[header]] : [];
      if (currentOptions.includes(option)) {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [header]: [...currentOptions, option] };
      }
    });
  };

  const applyColumnFilter = () => {
    setOpenFilterDropdown(null); // Fecha o dropdown após aplicar
  };

  const clearColumnFilter = (header) => {
    setSelectedFilterOptions(prev => {
      const newOptions = { ...prev };
      delete newOptions[header]; // Remove todas as seleções para esta coluna
      return newOptions;
    });
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  };

  const toggleFilterDropdown = (header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  };

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

  // eslint-disable-next-line no-unused-vars
  const normalizedSearchTerm = useMemo(() => normalizeForComparison(searchTerm), [searchTerm, normalizeForComparison]);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtros de coluna
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row => selectedOptions.includes(row[header]));
      }
    });

    // Aplica filtro de busca global
    if (searchTerm) {
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica ordenação
    return [...filteredData].sort(sortData);
  }, [data, selectedFilterOptions, searchTerm, tableHeaders, normalizeForComparison, normalizedSearchTerm, sortData]); // Removidas dependências desnecessárias

  const overdueCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = data.filter(row => {
      const dataLimite = parseDateForComparison(row['Data Limite']);
      return dataLimite && (dataLimite < today || dataLimite.getTime() === today.getTime());
    }).map(row => {
      // Mapeia os dados para a ordem dos cabeçalhos e formata datas
      const newRow = {};
      tableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          newRow[header] = formatDataLimite(row[header]);
        } else if (header === 'Justificativa do Abono') {
          newRow[header] = getJustificativaCellText(row);
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    if (dataToExport.length === 0) {
      alert('Não há itens pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: tableHeaders });

    // Definir larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 120; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 20; break;
        case 'Serviço': width = 30; break;
        case 'Status': width = 15; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 15; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 20; break;
        case 'Justificativa do Abono': width = 35; break;
        default: width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplicar estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplicar estilos às células de dados
    dataToExport.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1; // +1 porque a linha 0 é o cabeçalho

      const isRowOverdue = isOverdue(row);
      const isRowDueToday = isDueToday(row);

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: excelRowIndex, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = { v: '' }; // Garante que a célula existe

        let cellStyle = {
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          }
        };

        // Estilo de fundo e texto da linha
        if (isRowOverdue) {
          cellStyle.fill = { fgColor: { rgb: "FFC00000" } }; // Vermelho intenso
          cellStyle.font = { color: { rgb: "FFFFFFFF" } }; // Texto branco
        } else if (isRowDueToday) {
          cellStyle.fill = { fgColor: { rgb: "FFFFC000" } }; // Amarelo
          cellStyle.font = { color: { rgb: "FF333333" } }; // Texto escuro
        } else {
          cellStyle.fill = { fgColor: { rgb: "FFE0F2F7" } }; // Azul claro
          cellStyle.font = { color: { rgb: "FF333333" } }; // Texto escuro
        }

        // Estilo específico para "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && getJustificativaCellText(row) === 'FALTA ABONAR') {
          cellStyle.fill = { fgColor: { rgb: "FF800080" } }; // Roxo intenso
          cellStyle.font = { color: { rgb: "FFFFFFFF" }, bold: true }; // Texto branco, negrito
        }

        // Formatação específica para CNPJ / CPF (como texto)
        if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Define o tipo da célula como string
        }

        // Formatação específica para Data Limite (como data)
        if (header === 'Data Limite' && ws[cellRef].v) {
          const dateValue = parseDateForComparison(ws[cellRef].v);
          if (dateValue && !isNaN(dateValue)) {
            ws[cellRef].v = dateValue; // Armazena o objeto Date
            ws[cellRef].t = 'd'; // Define o tipo da célula como data
            ws[cellRef].z = 'DD/MM/YYYY'; // Formato de exibição
          }
        }

        ws[cellRef].s = cellStyle;
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, "Pendentes_Hoje.xlsx");
  }, [data, tableHeaders, isOverdue, isDueToday, parseDateForComparison, formatDataLimite, getJustificativaCellText]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>

          <div className="global-actions-section">
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              Exportar Pendentes Hoje (Excel)
            </button>
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
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
                      <span onClick={() => handleSort(header)}>
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
                              {getColumnFilterOptions(header).map(option => (
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
