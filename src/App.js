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
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    // Garante que a string de data seja apenas DD/MM/YYYY, removendo qualquer parte de hora
    const datePart = dateString.split(' ')[0];
    const [day, month, year] = datePart.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return '';
  }, [parseDateForComparison]);

  // Função para verificar se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return dataLimite < today;
  }, [parseDateForComparison]);

  // Função para verificar se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Função para determinar a classe da linha
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    // eslint-disable-next-line no-unused-vars
    const isAbonar = justificativa === 'falta abonar' || justificativa === ''; // isAbonar é usada na lógica de getJustificativaCellStyle/Text
    const overdue = isOverdue(row);
    const dueToday = isDueToday(row);

    if (overdue) {
      return 'row-overdue';
    } else if (dueToday) {
      return 'row-due-today';
    }
    return 'row-default-blue';
  }, [isOverdue, isDueToday, normalizeForComparison]);

  // Função para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const overdue = isOverdue(row);

    if (overdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Função para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const overdue = isOverdue(row);

    if (overdue && (justificativa === 'falta abonar' || justificativa === '')) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


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
    setData([]); // Limpa os dados da tabela ao selecionar um novo arquivo
    setTableHeaders([]); // Limpa os cabeçalhos
    setSortColumn('Data Limite'); // Reseta a coluna de ordenação
    setSortDirection('asc'); // Reseta a direção de ordenação para crescente (mais antigo para mais recente)
    setSearchTerm(''); // Limpa o termo de busca
    setSelectedFilterOptions({ // Reseta os filtros para o padrão
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
    setActiveFilterColumn(null); // Fecha qualquer dropdown de filtro aberto
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
        setTableHeaders(defaultTableHeaders); // Usa os cabeçalhos padrão definidos
        setData(result);

        // Gera opções de filtro dinamicamente
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          if (header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Chamado' && header !== 'Numero Referencia') { // Exclui colunas que não precisam de filtro de texto
            const uniqueValues = [...new Set(result.map(row => row[header]))].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
            newFilterOptions[header] = uniqueValues;
          }
        });
        setFilterOptions(newFilterOptions);

      } else {
        setData([]);
        setTableHeaders([]);
        setError('Nenhum dado válido encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
      setData([]);
      setTableHeaders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const handleFilterChange = useCallback((column, option, isChecked) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (isChecked) {
        return { ...prev, [column]: [...currentOptions, option] };
      } else {
        return { ...prev, [column]: currentOptions.filter(item => item !== option) };
      }
    });
  }, []);

  const applyFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
  }, []);

  const filteredData = useMemo(() => {
    let currentData = data;

    // 1. Filtrar por termo de busca
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções selecionadas
    currentData = currentData.filter(row => {
      return Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        return selectedOptions.includes(row[column]);
      });
    });

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, tableHeaders, normalizeForComparison]);


  const sortedData = useMemo(() => {
    if (!sortColumn || filteredData.length === 0) {
      return filteredData;
    }

    const sorted = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
        if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // Para outros tipos de dados (string, number)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortColumn, sortDirection, parseDateForComparison]);

  // Dados filtrados e ordenados para exibição na tabela
  const filteredAndSortedData = sortedData;

  // Formata a data atual para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportToExcel = useCallback(() => {
    const dataToExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há dados atrasados ou vencendo hoje para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => ({ v: header, t: 's' }))]; // Cabeçalhos com tipo string
    dataToExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        let value = row[header];
        let type = 's'; // Default to string

        if (header === 'Data Limite') {
          value = formatDataLimite(value); // Garante o formato DD/MM/YYYY
          type = 's'; // Mantém como string para evitar problemas de formatação de data no Excel
        } else if (header === 'CNPJ / CPF') {
          value = String(value).replace(/[^\d]/g, ''); // Remove caracteres não numéricos
          type = 's'; // Mantém como string para preservar zeros à esquerda e evitar formatação numérica
        } else if (typeof value === 'number') {
          type = 'n';
        } else if (typeof value === 'boolean') {
          type = 'b';
        }

        return { v: value, t: type };
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // --- Estilos de Cabeçalho ---
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Branco
      fill: { fgColor: { rgb: "FF2F528D" } }, // Azul escuro
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplicar estilo aos cabeçalhos
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cell_address = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cell_address]) ws[cell_address] = {};
      ws[cell_address].s = headerStyle;
    }

    // --- Estilos de Linha e Célula ---
    for (let R = 1; R <= dataToExport.length; ++R) { // Começa da linha 1 (dados)
      const rowData = dataToExport[R - 1]; // Pega o objeto de dados da linha
      const rowClass = getRowClass(rowData); // Determina a classe da linha (vermelho, amarelo, azul)

      let rowBgColor = "FFFFFFFF"; // Branco padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (rowClass === 'row-overdue') {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      } else if (rowClass === 'row-default-blue') {
        rowBgColor = "FFE0F2F7"; // Azul claro
        rowTextColor = "FF000000"; // Preto
      }

      for (let C = 0; C < tableHeaders.length; ++C) {
        const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cell_address]) ws[cell_address] = {};

        const cellStyle = {
          font: { color: { rgb: rowTextColor } },
          fill: { fgColor: { rgb: rowBgColor } },
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          }
        };

        // Sobrescrever estilo para "Justificativa do Abono" se for o caso
        if (tableHeaders[C] === 'Justificativa do Abono') {
          const justificativaCellStyle = getJustificativaCellStyle(rowData);
          if (Object.keys(justificativaCellStyle).length > 0) { // Se houver estilo específico
            cellStyle.fill.fgColor.rgb = "FF800080"; // Roxo intenso
            cellStyle.font.color.rgb = "FFFFFFFF"; // Branco
            cellStyle.font.bold = true;
            ws[cell_address].v = getJustificativaCellText(rowData); // Garante o texto "FALTA ABONAR"
          }
        }

        ws[cell_address].s = cellStyle;
      }
    }

    // --- Larguras das Colunas ---
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 20; break;
        case 'Serviço': width = 30; break;
        case 'Status': width = 18; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 18; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 20; break;
        case 'Justificativa do Abono': width = 35; break;
        default: width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellStyle, getJustificativaCellText, formatDataLimite, todayFormatted]);


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
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
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
            <button onClick={exportToExcel} className="export-button">
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
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      {header !== 'Data Limite' && header !== 'CNPJ / CPF' && header !== 'Chamado' && header !== 'Numero Referencia' && (
                        <div className="filter-icon-container" ref={filterDropdownRef}>
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                            onClick={() => setActiveFilterColumn(activeFilterColumn === header ? null : header)}
                          />
                          {activeFilterColumn === header && (
                            <div className="filter-dropdown">
                              <div className="filter-options-container">
                                {filterOptions[header] && filterOptions[header].map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={(selectedFilterOptions[header] || []).includes(option)}
                                      onChange={(e) => handleFilterChange(header, option, e.target.checked)}
                                    />
                                    {option}
                                  </label>
                                ))}
                              </div>
                              <div className="filter-actions">
                                <button onClick={applyFilter}>Aplicar</button>
                                <button onClick={() => clearFilter(header)}>Limpar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
