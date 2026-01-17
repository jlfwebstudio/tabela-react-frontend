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
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Padrão: crescente (do mais antigo para o mais recente)
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
    const parts = datePart.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }, []);

  // Função para formatar a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Remove a parte da hora se existir
    return dateString.split(' ')[0];
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // CORRIGIDO: isOverdue e isDueToday agora recebem a row completa
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // CORRIGIDO: isOverdue e isDueToday agora recebem a row completa
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // CORRIGIDO: Lógica para determinar a classe CSS da linha (cor)
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);
    const isRowDueToday = isDueToday(row);

    // Se estiver atrasada E a justificativa for "FALTA ABONAR" (ou vazia), a linha é vermelha
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return 'row-overdue';
    }
    // Se estiver atrasada (e não for "FALTA ABONAR"), a linha é vermelha
    if (isRowOverdue) {
      return 'row-overdue';
    }
    // Se vence hoje, a linha é amarela
    if (isRowDueToday) {
      return 'row-due-today';
    }
    // Caso contrário, é azul padrão
    return 'row-default-blue';
  }, [isOverdue, isDueToday, normalizeForComparison]);

  // CORRIGIDO: Lógica para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);

    // Aplica roxo intenso se estiver atrasado E a justificativa for "FALTA ABONAR" (ou vazia)
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // CORRIGIDO: Lógica para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isRowOverdue = isOverdue(row);

    // Exibe "FALTA ABONAR" se estiver atrasado E a justificativa for "FALTA ABONAR" (ou vazia)
    if (isRowOverdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && !event.target.closest('.filter-icon')) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((event) => {
    setFile(event.target.files[0]);
    setError('');
    // Resetar estados relevantes ao selecionar novo arquivo
    setData([]);
    setTableHeaders(defaultTableHeaders);
    setSortColumn('Data Limite');
    setSortDirection('asc'); // Manter 'asc' para o novo padrão
    setSearchTerm('');
    setActiveFilterColumn(null);
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  }, [defaultTableHeaders]);

  // Função para processar o CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders(defaultTableHeaders);

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
  }, [file, backendUrl, defaultTableHeaders]);

  // Função para lidar com a mudança no termo de busca global
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Função para lidar com a ordenação da tabela
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
  const handleFilterOptionChange = useCallback((header, option, isChecked) => {
    setSelectedFilterOptions(prevSelected => {
      const currentOptions = prevSelected[header] || [];
      if (isChecked) {
        return { ...prevSelected, [header]: [...currentOptions, option] };
      } else {
        return { ...prevSelected, [header]: currentOptions.filter(item => item !== option) };
      }
    });
  }, []);

  // Função para aplicar os filtros selecionados (fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null);
  }, []);

  // Função para limpar o filtro de coluna
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prevSelected => ({
      ...prevSelected,
      [header]: []
    }));
    setActiveFilterColumn(null);
  }, []);

  // Filtra e ordena os dados
  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

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
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison, tableHeaders]);

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
      const justificativaText = getJustificativaCellText(rowData); // Obtém o texto formatado

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
          if (header === 'Justificativa do Abono' && justificativaText === 'FALTA ABONAR') {
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
    XLSX.writeFile(wb, `PendentesHoje_${todayFormatted}.xlsx`); // Adicionado data ao nome do arquivo
  }, [filteredAndSortedData, tableHeaders, getRowClass, normalizeForComparison, isOverdue, formatDataLimite, isDueToday, today]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Selecionar CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              <FontAwesomeIcon icon={faUpload} /> {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>

          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
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
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
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
                      <div className="filter-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header || (selectedFilterOptions[header] && selectedFilterOptions[header].length > 0) ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && filterOptions[header] && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option, true)}
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
