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
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
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

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    // Garante que a data seja tratada como DD/MM/YYYY, ignorando qualquer hora
    const [day, month, year] = dateString.split(' ')[0].split('/').map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Formata a data de hoje para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Determina a classe CSS da linha com base no status e data
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasado
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro para os demais
  }, [isOverdue, isDueToday]);


  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // Função para obter opções de filtro para uma coluna
  const getColumnFilterOptions = useCallback((columnName) => {
    const options = new Set();
    data.forEach(row => {
      if (row[columnName]) {
        options.add(row[columnName]);
      }
    });
    return Array.from(options).sort((a, b) => String(a).localeCompare(String(b)));
  }, [data]);

  // Efeito para popular os cabeçalhos e opções de filtro quando os dados mudam
  useEffect(() => {
    if (data.length > 0) {
      setTableHeaders(defaultTableHeaders);
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        newFilterOptions[header] = getColumnFilterOptions(header);
      });
      setFilterOptions(newFilterOptions);
    } else {
      setTableHeaders([]);
      setFilterOptions({});
    }
  }, [data, defaultTableHeaders, getColumnFilterOptions]);

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

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    setData([]); // Limpa os dados anteriores ao selecionar novo arquivo
    setSortColumn('Data Limite'); // Reseta a ordenação
    setSortDirection('asc'); // Reseta a direção para ascendente
    setSelectedFilterOptions({ // Reseta os filtros de status
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
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
      setData(result);
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ao mudar de coluna
    }
  }, [sortColumn, sortDirection]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const toggleFilterDropdown = useCallback((columnName) => {
    setActiveFilterColumn(activeFilterColumn === columnName ? null : columnName);
  }, [activeFilterColumn]);

  const handleFilterOptionChange = useCallback((columnName, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[columnName] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [columnName]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [columnName]: [...currentOptions, option]
        };
      }
    });
  }, []);

  const applyColumnFilter = useCallback(() => {
    // A filtragem é aplicada automaticamente via useMemo filteredAndSortedData
    setActiveFilterColumn(null);
  }, []);

  const clearColumnFilter = useCallback((columnName) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [columnName]: [] // Limpa todas as opções selecionadas para esta coluna
    }));
    setActiveFilterColumn(null);
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtragem por termo de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtragem por colunas (dropdowns)
    filteredData = filteredData.filter(row => {
      return Object.entries(selectedFilterOptions).every(([column, selectedOptions]) => {
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        const rowValue = normalizeForComparison(row[column]);
        return selectedOptions.some(option => normalizeForComparison(option) === rowValue);
      });
    });

    // 3. Ordenação
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Lógica de ordenação para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Lógica de ordenação para outros tipos (string, number)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      // Fallback para outros tipos ou valores mistos
      return 0;
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);


  const exportToExcel = useCallback(() => {
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    // Criar uma nova folha de trabalho com os dados
    const ws = XLSX.utils.json_to_sheet(filteredForExport, { header: tableHeaders });

    // Definir estilos para os cabeçalhos (linha 1 do Excel)
    const headerStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, // Fonte Calibri, tamanho 12
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro para cabeçalhos, correspondendo ao CSS
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Aplicar estilos aos cabeçalhos
    tableHeaders.forEach((header, index) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index }); // r: 0 para a primeira linha (cabeçalhos)
      if (!ws[cellAddress]) ws[cellAddress] = { v: header }; // Garante que a célula exista e tenha o valor do cabeçalho
      ws[cellAddress].s = headerStyle;
    });

    // Aplicar estilos às células de dados (a partir da linha 2 do Excel)
    for (let R = 0; R < filteredForExport.length; R++) {
      const rowData = filteredForExport[R];
      const rowClass = getRowClass(rowData); // Obter a classe da linha para determinar a cor
      const isAbonarCell = isOverdue(rowData) && (normalizeForComparison(rowData['Justificativa do Abono']) === 'falta abonar' || normalizeForComparison(rowData['Justificativa do Abono']) === '');

      for (let C = 0; C < tableHeaders.length; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R + 1, c: C }); // +1 para pular o cabeçalho
        const header = tableHeaders[C];
        let cellValue = rowData[header];

        // Estilo padrão para a célula
        let cellStyle = {
          font: { name: "Calibri", sz: 12, color: { rgb: "000000" } }, // Fonte Calibri, tamanho 12, texto preto padrão
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
          alignment: { vertical: "center", wrapText: false } // Alinhamento vertical padrão, sem quebra de texto
        };

        // Aplicar cor de fundo da linha
        if (rowClass === 'row-overdue') {
          cellStyle.fill = { fgColor: { rgb: "C00000" } }; // Vermelho intenso
          cellStyle.font.color = { rgb: "FFFFFF" }; // Texto branco
        } else if (rowClass === 'row-due-today') {
          cellStyle.fill = { fgColor: { rgb: "FFC000" } }; // Amarelo
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        } else {
          cellStyle.fill = { fgColor: { rgb: "E0F2F7" } }; // Azul claro
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        }

        // Aplicar estilo específico para "Justificativa do Abono" se for "FALTA ABONAR"
        // Este estilo deve sobrescrever a cor de fundo da linha
        if (header === 'Justificativa do Abono' && isAbonarCell) {
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          cellStyle.font.color = { rgb: "FFFFFF" }; // Texto branco
          cellStyle.font.bold = true; // Negrito
          cellValue = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR" no Excel
        }

        // Formatação específica para CNPJ / CPF como texto
        if (header === 'CNPJ / CPF') {
          cellStyle.numFmt = '@'; // Formato de texto
          cellStyle.alignment.horizontal = "left"; // Alinhar à esquerda para texto
          // Remover o '=' e as aspas se existirem, e garantir que seja apenas dígitos
          if (typeof cellValue === 'string') {
            cellValue = cellValue.replace(/['"=]/g, '').trim();
          }
        } else if (header === 'Data Limite') {
          // Formatação específica para Data Limite como data
          const formattedDate = formatDataLimite(cellValue);
          if (formattedDate) {
            const dateObj = parseDateForComparison(cellValue);
            if (dateObj) {
              const excelDate = Math.floor(dateObj.getTime() / (1000 * 60 * 60 * 24) + 25569);
              ws[cellAddress] = { v: excelDate, t: 'n', s: { ...cellStyle, numFmt: 'DD/MM/YYYY' } };
            } else {
              ws[cellAddress] = { v: formattedDate, t: 's', s: cellStyle };
            }
          } else {
            ws[cellAddress] = { v: cellValue, t: 's', s: cellStyle };
          }
        } else {
          // Para outras células, atribui o valor e o estilo
          if (!ws[cellAddress]) ws[cellAddress] = {}; // Garante que a célula exista
          ws[cellAddress].v = cellValue;
          ws[cellAddress].s = cellStyle;
          ws[cellAddress].t = typeof cellValue === 'number' ? 'n' : 's'; // Define o tipo da célula (number ou string)
          cellStyle.alignment.horizontal = "left"; // Alinhar texto à esquerda por padrão
        }
      }
    }

    // Ajustar largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      else if (header === 'Justificativa do Abono') width = 40;
      else if (header === 'Contratante' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Chamado') width = 15;
      else if (header === 'Status') width = 18;
      else if (header === 'Cidade') width = 18;
      else if (header === 'Data Limite') width = 15;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Adicionar AutoFiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congelar a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes");

    // Definir cor da aba (sheet tab)
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [];
    if (!wb.Workbook.Views[0]) wb.Workbook.Views[0] = {};
    wb.Workbook.Views[0].TabRatio = 600; // Ajusta a proporção da aba
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    wb.Workbook.Sheets[0] = {
      ...wb.Workbook.Sheets[0],
      TabColor: { rgb: "4472C4" } // Cor azul escuro para a aba
    };

    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, isOverdue, isDueToday, tableHeaders, getRowClass, normalizeForComparison, formatDataLimite, parseDateForComparison, todayFormatted]);


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
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em toda a tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
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
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
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
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
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
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim() // Remove '=' e aspas
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
