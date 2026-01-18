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
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
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
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);


  // Estilo para a célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' };
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
    function handleClickOutside(event) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef]); // filterDropdownRef é uma ref, não precisa de toggleFilterDropdown aqui.

  // Lógica de upload de arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    // Memória: "User wants only statuses Encaminhado, Em transferência, Em campo, Reencaminhado, Procedimento Técnico visible and exported."
    // Resetar os filtros de status para o padrão ao carregar um novo arquivo
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
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
        throw new Error(errorData.error || 'Falha ao processar o arquivo CSV.');
      }

      const result = await response.json();
      if (result.data && result.data.length > 0) {
        setData(result.data);
        // Memória: "User wants the Cliente column to be correctly populated from the CSV data"
        // A lógica de mapeamento e preenchimento da coluna Cliente já está no backend.
      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao fazer upload: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lógica de filtro por coluna
  const toggleFilterDropdown = useCallback((header) => {
    setActiveFilterColumn(prev => (prev === header ? null : header));
  }, []); // Sem dependências, pois só alterna o estado

  const handleFilterOptionChange = useCallback((header, option) => {
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
  }, []);

  const applyColumnFilter = useCallback(() => {
    // A filtragem é aplicada automaticamente via `filteredData` no `useMemo`
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: [] // Limpa todas as opções selecionadas para esta coluna
    }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Lógica de busca global
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Dados filtrados e ordenados para exibição na tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header];
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // Aplica filtros de coluna
    filteredData = filteredData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Nenhum filtro aplicado para esta coluna
        }
        const rowValue = String(row[header]).trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Aplica ordenação
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === 'asc' ? 1 : -1;
        if (!dateB) return sortDirection === 'asc' ? -1 : 1;

        return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } else {
        const valA = normalizeForComparison(aValue);
        const valB = normalizeForComparison(bValue);
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Calcula o número de pendentes hoje (atrasados ou vencendo hoje)
  // Memória: "User wants the overdue counter to count all rows with Data Limite earlier than now, regardless of justification."
  const overdueCount = useMemo(() => {
    // Contar apenas os dados que seriam exportados (pendentes hoje)
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);


  // Função para exportar dados para Excel
  // Memória: "User wants exported Excel sheets to include only today’s pending items (overdue and due today) while preserving table colors."
  // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
  const exportToExcel = useCallback(() => {
    // Filtra os dados para incluir apenas os pendentes (atrasados ou vencendo hoje)
    const filteredForExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há dados pendentes para exportar hoje.');
      return;
    }

    // Mapeia os dados para o formato que o XLSX.utils.json_to_sheet espera
    // Garante que a ordem das colunas seja a definida em defaultTableHeaders
    const exportData = filteredForExport.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        let value = row[header];
        // Limpeza específica para CNPJ / CPF: remove tudo que não for dígito e formata como texto
        if (header === 'CNPJ / CPF' && value) {
          value = String(value).replace(/[^\d]/g, '');
        }
        // Para a célula "Justificativa do Abono", usa o texto formatado
        else if (header === 'Justificativa do Abono') {
          value = getJustificativaCellText(row);
        }
        newRow[header] = value;
      });
      return newRow;
    });

    // Cria a planilha a partir dos dados JSON
    const ws = XLSX.utils.json_to_sheet(exportData, { header: tableHeaders });

    // Define larguras das colunas
    // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
    ws['!cols'] = [
      { wch: 12 }, // Chamado
      { wch: 18 }, // Numero Referencia
      { wch: 15 }, // Contratante
      { wch: 30 }, // Serviço
      { wch: 20 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 25 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 15 }, // Cidade
      { wch: 20 }, // Técnico
      { wch: 20 }, // Prestador
      { wch: 25 }  // Justificativa do Abono
    ];

    // Estilos padrão para cabeçalhos
    const headerStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      }
    };

    // Aplica estilos às células
    // Itera sobre as células para aplicar estilos e formatação condicional
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = {};

        // Estilo padrão para células de dados
        let cellStyle = {
          font: { name: "Calibri", sz: 12, color: { rgb: "000000" } }, // Texto preto padrão
          fill: { fgColor: { rgb: "E0F2F7" } }, // Azul claro suave padrão (row-default-blue)
          alignment: { vertical: "center", wrapText: false },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };

        // Aplica estilo de cabeçalho para a primeira linha
        if (R === 0) {
          ws[cellAddress].s = headerStyle;
          continue; // Já aplicou o estilo do cabeçalho, passa para a próxima célula
        }

        // Obtém a linha de dados correspondente (R-1 porque a primeira linha é o cabeçalho)
        const rowData = filteredForExport[R - 1];
        const header = tableHeaders[C];
        const cellValue = rowData[header];

        // Aplica estilos de linha condicional
        if (isOverdue(rowData)) {
          // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
          cellStyle.fill.fgColor.rgb = "C00000"; // Vermelho intenso
          cellStyle.font.color.rgb = "FFFFFF"; // Texto branco
        } else if (isDueToday(rowData)) {
          cellStyle.fill.fgColor.rgb = "FFC000"; // Amarelo
          cellStyle.font.color.rgb = "000000"; // Texto preto
        }

        // Estilos e valores específicos para 'Justificativa do Abono'
        if (header === 'Justificativa do Abono') {
          const justificativa = normalizeForComparison(rowData['Justificativa do Abono']);
          const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

          if (isOverdue(rowData) && isAbonarCondition) {
            // Memória: "User prefers the red background of rows with “Falta Abonar” cells to be less intense, matching the overall table color scheme."
            // No entanto, a memória mais recente pede "stronger, more intense red for all overdue rows, including those marked “Falta Abonar”"
            // E a memória anterior pedia roxo intenso para "FALTA ABONAR". Vamos manter o roxo para destaque máximo.
            cellStyle.fill.fgColor.rgb = "800080"; // Roxo intenso
            cellStyle.font.color.rgb = "FFFFFF"; // Texto branco
            cellStyle.font.bold = true; // Negrito
            ws[cellAddress].v = 'FALTA ABONAR'; // Define o texto da célula
            ws[cellAddress].t = 's'; // Tipo string
          } else {
            ws[cellAddress].v = cellValue;
            ws[cellAddress].t = 's'; // Tipo string
          }
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
        }
        // Estilos e valores específicos para 'Data Limite'
        else if (header === 'Data Limite') {
          const date = parseDateForComparison(cellValue);
          if (date && !isNaN(date)) {
            // Converte a data para o número de série do Excel
            // A função date_to_excel é a forma correta, mas se não estiver disponível,
            // a alternativa manual é (date.getTime() / (1000 * 60 * 60 * 24)) + 25569
            // Vamos usar a função da biblioteca, que deve estar disponível com xlsx@latest
            ws[cellAddress].v = XLSX.utils.date_to_num(date, { date1904: false }); // Usando date_to_num, que é um alias para date_to_excel em versões recentes
            ws[cellAddress].t = 'n'; // Tipo número para datas
            cellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" }; // Centraliza
          } else {
            ws[cellAddress].v = String(cellValue || '');
            ws[cellAddress].t = 's'; // Tipo string
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
          }
        }
        // Estilos e valores específicos para 'CNPJ / CPF'
        else if (header === 'CNPJ / CPF') {
          ws[cellAddress].v = String(cellValue || '').replace(/[^\d]/g, ''); // Garante apenas dígitos
          ws[cellAddress].t = 's'; // Tipo string para evitar formatação numérica
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" };
        }
        // Estilos e valores para outras colunas de texto
        else {
          ws[cellAddress].v = cellValue;
          ws[cellAddress].t = 's'; // Tipo string
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" };
        }

        // Aplica o estilo final à célula
        ws[cellAddress].s = cellStyle;
      }
    }

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cria o workbook e adiciona a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes');

    // Define a cor da aba
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    wb.Workbook.Sheets[0] = {
      ...wb.Workbook.Sheets[0],
      TabColor: { rgb: "4472C4" } // Azul escuro
    };

    // Gera o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);

  }, [data, tableHeaders, isOverdue, isDueToday, getJustificativaCellText, parseDateForComparison, normalizeForComparison, todayFormatted]);


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
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
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
