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
  // Ajuste aqui: 'asc' para ordenar do mais antigo para o mais recente
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // ALTERADO PARA 'asc'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);

  const filterDropdownRef = useRef(null);

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

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date (ignorando a hora)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    // Garante que estamos pegando apenas a parte da data antes de dividir
    const datePart = dateString.split(' ')[0];
    const [day, month, year] = datePart.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Função para formatar a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna a string original se não puder ser parseada
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';

    // Prioridade para "FALTA ABONAR" se a OS estiver atrasada
    if (isOverdue(row) && isAbonar) {
      return 'row-overdue'; // Mantém vermelho para atraso, o estilo da célula roxa prevalecerá
    } else if (isOverdue(row)) {
      return 'row-overdue';
    } else if (isDueToday(row)) {
      return 'row-due-today';
    } else {
      return 'row-default-blue';
    }
  }, [isOverdue, isDueToday, normalizeForComparison]);

  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';
    const isRowOverdue = isOverdue(row);

    if (isRowOverdue && isAbonar) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';
    const isRowOverdue = isOverdue(row);

    if (isRowOverdue && isAbonar) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para lidar com o upload do arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    // Ao carregar um novo arquivo, resetar a ordenação para o padrão
    setSortColumn('Data Limite');
    setSortDirection('asc'); // Manter 'asc' para o novo padrão
  };

  // Função para processar o CSV
  const processCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa os dados anteriores
    setTableHeaders([]); // Limpa os cabeçalhos anteriores
    setFilterOptions({}); // Limpa as opções de filtro

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
        // Define os cabeçalhos da tabela na ordem padrão
        setTableHeaders(defaultTableHeaders);

        // Gera opções de filtro para todas as colunas
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const uniqueValues = [...new Set(result.map(row => row[header]))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
          newFilterOptions[header] = uniqueValues;
        });
        setFilterOptions(newFilterOptions);

        setData(result);
      } else {
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Função para alternar a direção da ordenação
  const handleSort = useCallback((column) => {
    setSortDirection(prevDirection =>
      column === sortColumn ? (prevDirection === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn]);

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prevColumn => (prevColumn === column ? null : column));
  }, []);

  // Função para lidar com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prevSelected => {
      const currentOptions = prevSelected[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prevSelected,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prevSelected,
          [header]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Função para limpar o filtro de coluna
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prevSelected => ({
      ...prevSelected,
      [header]: [] // Limpa todas as opções selecionadas para esta coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Filtra e ordena os dados
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // 1. Aplica filtros de coluna (incluindo o filtro padrão de Status)
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.includes(row[header])
        );
      }
    });

    // 2. Aplica filtro de pesquisa global
    const normalizedSearchTerm = normalizeForComparison(searchTerm);
    if (normalizedSearchTerm) {
      currentData = currentData.filter(row =>
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizedSearchTerm)
        )
      );
    }

    // 3. Ordena os dados
    if (sortColumn) {
      currentData = [...currentData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        let comparison = 0;
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            comparison = dateA.getTime() - dateB.getTime();
          } else if (dateA) {
            comparison = -1; // Datas válidas vêm antes de nulas
          } else if (dateB) {
            comparison = 1; // Nulas vêm depois de datas válidas
          } else {
            comparison = 0; // Ambas nulas, sem diferença
          }
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue));
        } else {
          // Fallback para outros tipos ou valores não string
          if (aValue < bValue) comparison = -1;
          if (aValue > bValue) comparison = 1;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Conta os itens atrasados e vencendo hoje
  const overdueAndDueTodayCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const dataToExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: tableHeaders });

    // Aplica estilos aos cabeçalhos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF1F497D" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (ws[cellRef]) {
        ws[cellRef].s = headerStyle;
      }
    });

    // Aplica estilos às células de dados
    for (let R = 1; R <= dataToExport.length; ++R) {
      const rowData = dataToExport[R - 1];
      const rowClass = getRowClass(rowData); // Obtém a classe da linha para determinar a cor de fundo
      const isAbonar = normalizeForComparison(rowData['Justificativa do Abono']) === 'falta abonar';
      const isRowOverdue = isOverdue(rowData);

      tableHeaders.forEach((header, C) => {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];

        if (cell) {
          let cellStyle = {
            border: {
              top: { style: "thin", color: { rgb: "FF000000" } },
              bottom: { style: "thin", color: { rgb: "FF000000" } },
              left: { style: "thin", color: { rgb: "FF000000" } },
              right: { style: "thin", color: { rgb: "FF000000" } },
            }
          };

          // Aplica cor de fundo da linha
          if (rowClass === 'row-overdue') {
            cellStyle.fill = { fgColor: { rgb: "FFC00000" } }; // Vermelho intenso
            cellStyle.font = { color: { rgb: "FFFFFFFF" } }; // Texto branco
          } else if (rowClass === 'row-due-today') {
            cellStyle.fill = { fgColor: { rgb: "FFFFC000" } }; // Amarelo
            cellStyle.font = { color: { rgb: "FF000000" } }; // Texto preto
          } else if (rowClass === 'row-default-blue') {
            cellStyle.fill = { fgColor: { rgb: "FFE0F2F7" } }; // Azul claro
            cellStyle.font = { color: { rgb: "FF000000" } }; // Texto preto
          }

          // Sobrescreve para "FALTA ABONAR" se aplicável
          if (header === 'Justificativa do Abono' && isRowOverdue && isAbonar) {
            cellStyle.fill = { fgColor: { rgb: "FF800080" } }; // Roxo intenso
            cellStyle.font = { color: { rgb: "FFFFFFFF" }, bold: true }; // Texto branco e negrito
          }

          // Formatação específica para CNPJ / CPF como texto
          if (header === 'CNPJ / CPF') {
            cellStyle.numFmt = '@'; // Formato de texto
            cell.t = 's'; // Garante que o tipo da célula seja string
            cell.v = rowData[header]; // Define o valor da célula
          }

          // Formatação específica para Data Limite
          if (header === 'Data Limite') {
            const formattedDate = formatDataLimite(rowData[header]);
            cell.t = 's'; // Define o tipo como string
            cell.v = formattedDate; // Define o valor formatado
          }

          cell.s = cellStyle;
        }
      });
    }

    // Ajusta a largura das colunas
    const colWidths = tableHeaders.map(header => {
      let width = header.length + 2; // Largura mínima baseada no cabeçalho
      // Larguras específicas para algumas colunas
      if (header === 'Chamado') width = 12;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Contratante') width = 20;
      else if (header === 'Serviço') width = 30;
      else if (header === 'Status') width = 18;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Cliente') width = 25;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Cidade') width = 18;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Prestador') width = 20;
      else if (header === 'Justificativa do Abono') width = 35;

      // Garante que a largura seja suficiente para o conteúdo
      const maxContentWidth = dataToExport.reduce((max, row) => {
        const cellValue = String(row[header] || '');
        return Math.max(max, cellValue.length);
      }, 0);
      return { wch: Math.max(width, maxContentWidth + 2) }; // +2 para padding
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, "PendentesHoje.xlsx");
  }, [filteredAndSortedData, tableHeaders, getRowClass, normalizeForComparison, isOverdue, formatDataLimite, isDueToday]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              <FontAwesomeIcon icon={faUpload} /> {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              Pendentes Hoje: {overdueAndDueTodayCount}
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
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
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="header-content">
                      <div className="sortable-header" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && (
                          <FontAwesomeIcon
                            icon={faSort}
                            className="sort-icon inactive"
                          />
                        )}
                      </div>
                      <div className="filter-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && filterOptions[header] && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header].map(option => (
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
