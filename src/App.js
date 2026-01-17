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
  const [sortDirection, setSortDirection] = useState('asc');
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
  // Ignora a parte da hora para comparações
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString); // Usa a função de parse para garantir que a hora seja zerada
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // DEFINIÇÃO DE todayFormatted - CORREÇÃO DO ERRO no-undef
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

  // Retorna a classe CSS da linha com base no status e data
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row)) {
      // Se está atrasado E precisa abonar, ainda é vermelho (atraso tem prioridade visual)
      // A cor roxa será aplicada na célula específica, não na linha inteira.
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue';
  }, [isOverdue, isDueToday, normalizeForComparison]);

  // Retorna o estilo inline para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return { backgroundColor: 'rgb(128, 0, 128)', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Retorna o texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);

  // Lida com o upload do arquivo
  const handleFileChange = useCallback((event) => {
    setFile(event.target.files[0]);
    setError('');
    // Ao carregar um novo arquivo, resetar a ordenação para o padrão
    setSortColumn('Data Limite');
    setSortDirection('asc'); // Manter a ordenação crescente como padrão
  }, []);

  // Processa o CSV (envia para o backend)
  const processCsv = useCallback(async () => {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      if (result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders); // Garante a ordem dos cabeçalhos
      } else {
        setError('Nenhum dado válido foi extraído do CSV.');
        setData([]);
        setTableHeaders([]);
      }
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
      setTableHeaders([]);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Lógica de ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Obtém opções de filtro únicas para cada coluna
  const getColumnFilterOptions = useCallback((colName) => {
    const options = new Set();
    data.forEach(row => {
      if (row[colName]) {
        options.add(row[colName]);
      }
    });
    return Array.from(options).sort((a, b) => String(a).localeCompare(String(b)));
  }, [data]);

  // Atualiza as opções de filtro sempre que os dados mudam
  useEffect(() => {
    const newFilterOptions = {};
    defaultTableHeaders.forEach(header => {
      newFilterOptions[header] = getColumnFilterOptions(header);
    });
    setFilterOptions(newFilterOptions);
  }, [data, defaultTableHeaders, getColumnFilterOptions]);

  // Lida com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((column, option, isChecked) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (isChecked) {
        return { ...prev, [column]: [...currentOptions, option] };
      } else {
        return { ...prev, [column]: currentOptions.filter(item => item !== option) };
      }
    });
  }, []);

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa o filtro de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
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

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data.filter(row => {
      // Filtro por termo de busca global
      const matchesSearch = searchTerm === '' ||
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizeForComparison(searchTerm))
        );

      // Filtro por colunas selecionadas
      const matchesFilters = Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        return selectedOptions.includes(row[column]);
      });

      return matchesSearch && matchesFilters;
    });

    // Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        // Lógica de ordenação para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(valA);
          const dateB = parseDateForComparison(valB);

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Lógica de ordenação para outros tipos (string, number)
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        // Fallback para números ou outros tipos
        return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valB > valA ? 1 : -1);
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Contagem de pendentes hoje
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Exporta dados para Excel (apenas pendentes hoje e atrasados)
  const exportToExcel = useCallback(() => {
    const dataToExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há dados pendentes ou vencendo hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: defaultTableHeaders });

    // Aplica estilos aos cabeçalhos
    defaultTableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = { v: header };
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2C3E50" } }, // Azul escuro
        alignment: { horizontal: "center", vertical: "center" }
      };
    });

    // Aplica estilos às células de dados
    dataToExport.forEach((row, rowIndex) => {
      defaultTableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        const cellValue = row[header];

        if (!ws[cellRef]) ws[cellRef] = { v: cellValue };
        ws[cellRef].v = cellValue; // Garante que o valor esteja lá

        let cellStyle = {
          alignment: { horizontal: "left", vertical: "center" },
          font: { color: { rgb: "000000" } } // Padrão: texto preto
        };

        // Estilos de linha (fundo)
        if (isOverdue(row)) {
          cellStyle.fill = { fgColor: { rgb: "C00000" } }; // Vermelho intenso
          cellStyle.font.color = { rgb: "FFFFFF" }; // Texto branco
        } else if (isDueToday(row)) {
          cellStyle.fill = { fgColor: { rgb: "FFC000" } }; // Amarelo
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        } else {
          cellStyle.fill = { fgColor: { rgb: "E0F2F7" } }; // Azul claro
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        }

        // Estilo específico para "Justificativa do Abono"
        if (header === 'Justificativa do Abono') {
          const justificativa = normalizeForComparison(row['Justificativa do Abono']);
          const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';
          if (isOverdue(row) && isAbonarCondition) {
            cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
            cellStyle.font.color = { rgb: "FFFFFF" }; // Texto branco
            cellStyle.font.bold = true;
            ws[cellRef].v = 'FALTA ABONAR'; // Altera o texto no Excel
          }
        }

        // Formatação específica para 'CNPJ / CPF' como texto
        if (header === 'CNPJ / CPF') {
          cellStyle.numFmt = '@'; // Formato de texto
          ws[cellRef].t = 's'; // Tipo string
        }

        // Formatação específica para 'Data Limite' como data
        if (header === 'Data Limite') {
          const dateValue = parseDateForComparison(row[header]);
          if (dateValue) {
            // XLSX armazena datas como números (dias desde 1900-01-01)
            // e aplica um formato de número para exibi-las como data.
            // O formato 'dd/mm/yyyy' é o mais comum para pt-BR.
            ws[cellRef].v = dateValue; // Armazena o objeto Date
            ws[cellRef].t = 'd'; // Tipo data
            cellStyle.numFmt = 'dd/mm/yyyy';
          }
        }

        ws[cellRef].s = cellStyle;
      });
    });

    // Ajusta a largura das colunas
    const wscols = defaultTableHeaders.map(header => {
      let width = 10; // Largura padrão
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
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes');
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, isOverdue, isDueToday, defaultTableHeaders, normalizeForComparison, parseDateForComparison, todayFormatted]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              <FontAwesomeIcon icon={faFileExcel} /> Processar CSV
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
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
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
          </div>
        </div>
        {loading && <p>Processando...</p>}
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
                      <span onClick={() => handleSort(header)} className="sortable-header">
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon default-sort-icon" />}
                      </span>
                      <div className="filter-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${selectedFilterOptions[header]?.length > 0 ? 'active' : ''}`}
                          onClick={() => setActiveFilterColumn(activeFilterColumn === header ? null : header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header]?.map(option => (
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
