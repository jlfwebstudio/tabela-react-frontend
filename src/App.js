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
    setData([]);
    setSortColumn('Data Limite');
    setSortDirection('asc');
    setSelectedFilterOptions({
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
      setSortDirection('asc');
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
    setActiveFilterColumn(null);
  }, []);

  const clearColumnFilter = useCallback((columnName) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [columnName]: []
    }));
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtrar por termo de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header];
          return cellValue && normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // 2. Filtrar por opções de coluna selecionadas
    Object.keys(selectedFilterOptions).forEach(columnName => {
      const selectedOptions = selectedFilterOptions[columnName];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(row[columnName])
        );
      }
    });

    // 3. Ordenar os dados
    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          // Lida com datas nulas ou inválidas, colocando-as no final
          if (!dateA && dateB) return sortDirection === 'asc' ? 1 : -1;
          if (dateA && !dateB) return sortDirection === 'asc' ? -1 : 1;
          return 0;
        }

        // Tratamento para outros tipos de dados (string, number)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para outros tipos ou valores nulos
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, tableHeaders, parseDateForComparison]);

  // Contagem de itens pendentes (atrasados ou vencendo hoje)
  const overdueCount = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);


  // Função para exportar dados para Excel com estilos
  const exportToExcel = useCallback(() => {
    // Filtra apenas os itens atrasados ou vencendo hoje para exportação
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há itens atrasados ou vencendo hoje para exportar.');
      return;
    }

    // Criar uma nova folha de trabalho com os dados
    // Usamos skipHeader: true porque vamos adicionar os cabeçalhos manualmente com estilos
    const ws = XLSX.utils.json_to_sheet(filteredForExport, { skipHeader: true });

    // Adicionar cabeçalhos com estilos na primeira linha (A1, B1, etc.)
    XLSX.utils.sheet_add_aoa(ws, [tableHeaders], { origin: 'A1' });

    // Estilo base para os cabeçalhos
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro para cabeçalhos
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
      if (!ws[cellAddress]) ws[cellAddress] = {}; // Garante que a célula exista
      ws[cellAddress].s = headerStyle;
    });

    // Estilo base para as células de dados
    const baseCellStyle = {
      font: { name: "Calibri", sz: 11, color: { rgb: "000000" } }, // Fonte padrão preta
      alignment: { vertical: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Aplicar estilos às células de dados (a partir da linha 2 do Excel)
    for (let R = 0; R < filteredForExport.length; R++) {
      const rowData = filteredForExport[R];
      const rowClass = getRowClass(rowData); // Obter a classe da linha para determinar a cor
      const isAbonarCell = isOverdue(rowData) && (normalizeForComparison(rowData['Justificativa do Abono']) === 'falta abonar' || normalizeForComparison(rowData['Justificativa do Abono']) === '');

      tableHeaders.forEach((header, C) => {
        const cellAddress = XLSX.utils.encode_cell({ r: R + 1, c: C }); // r: R + 1 porque a linha 0 é o cabeçalho
        let cellValue = rowData[header];
        const cellStyle = { ...baseCellStyle }; // Copia o estilo base para cada célula

        // Define a cor de fundo da linha
        if (rowClass === 'row-overdue') {
          cellStyle.fill = { fgColor: { rgb: "C00000" } }; // Vermelho intenso
          cellStyle.font.color = { rgb: "FFFFFF" }; // Texto branco
        } else if (rowClass === 'row-due-today') {
          cellStyle.fill = { fgColor: { rgb: "FFC000" } }; // Amarelo
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        } else if (rowClass === 'row-default-blue') {
          cellStyle.fill = { fgColor: { rgb: "E0F2F7" } }; // Azul claro suave
          cellStyle.font.color = { rgb: "000000" }; // Texto preto
        }

        // Estilos e valores específicos para 'Justificativa do Abono'
        if (header === 'Justificativa do Abono' && isAbonarCell) {
          cellValue = 'FALTA ABONAR';
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo intenso
          cellStyle.font = { ...cellStyle.font, bold: true, color: { rgb: "FFFFFF" } }; // Negrito, texto branco
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" }; // Centraliza
        }
        // Estilos e valores específicos para 'Data Limite'
        else if (header === 'Data Limite') {
          const date = parseDateForComparison(cellValue);
          if (date && !isNaN(date)) {
            // CORREÇÃO: Usar XLSX.utils.date_to_excel em vez de XLSX.utils.date_to_num
            cellValue = XLSX.utils.date_to_excel(date, { date1904: false }); // Converte para número de série do Excel
            cellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" }; // Centraliza
          } else {
            // Se não for uma data válida, exporta como texto e alinha ao centro
            cellValue = String(cellValue || '');
            cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
          }
        }
        // Estilos e valores específicos para 'CNPJ / CPF'
        else if (header === 'CNPJ / CPF') {
          cellValue = String(cellValue || '').replace(/['"=]/g, '').trim(); // Remove '=', aspas
          cellStyle.numFmt = '@'; // Formato de texto
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" }; // Alinha à esquerda
        }
        // Alinhamento para outras colunas de texto
        else if (['Serviço', 'Contratante', 'Cliente', 'Técnico', 'Prestador', 'Cidade'].includes(header)) {
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "left" };
        }
        // Alinhamento padrão para outras colunas (ex: Chamado, Numero Referencia, Status)
        else {
          cellStyle.alignment = { ...cellStyle.alignment, horizontal: "center" };
        }

        // Garante que a célula exista e atribui valor e estilo
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].v = cellValue;
        ws[cellAddress].s = cellStyle;
        // Define o tipo da célula: 'n' para número (datas são números), 's' para string
        ws[cellAddress].t = typeof cellValue === 'number' ? 'n' : 's';
      });
    }

    // Definir larguras das colunas
    ws['!cols'] = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 18; break;
        case 'Serviço': width = 30; break; // Mais largo para nomes completos
        case 'Status': width = 20; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break; // Ligeiramente mais largo
        case 'Cidade': width = 20; break; // Ligeiramente mais largo
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 25; break; // Mais largo
        default: width = 15;
      }
      return { wch: width }; // wch é a largura em caracteres
    });

    // Adicionar autofiltro aos cabeçalhos
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congelar a primeira linha (cabeçalhos)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Criar um novo livro de trabalho
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes"); // Nome da aba

    // Definir a cor da aba (se a estrutura existir)
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [{}]; // Garante que Views[0] exista
    wb.Workbook.Views[0].TabColor = { rgb: "4472C4" }; // Cor da aba azul escuro

    // Gerar o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, isOverdue, isDueToday, normalizeForComparison, parseDateForComparison, tableHeaders, todayFormatted, getRowClass]);

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
