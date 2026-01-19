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
  const [currentOverdueCount, setCurrentOverdueCount] = useState(0); // Contador de pendências

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

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return normalizedJustificativa === '' || normalizedJustificativa === 'falta abonar';
  }, [normalizeForComparison]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  const getJustificativaCellStyle = useCallback((row) => {
    if (isOverdue(row) && isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
        textAlign: 'center'
      };
    }
    return {};
  }, [isOverdue, isAbonarCondition]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    if (isOverdue(row) && isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue, isAbonarCondition]);

  // Retorna a classe CSS para a linha da tabela
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Lida com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Lida com o upload do arquivo CSV para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', file); // <-- CORRIGIDO AQUI: Usando 'file' como nome do campo

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler a resposta como JSON primeiro
        let errorMessage = `Erro no servidor: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage += ` - ${errorData.message || JSON.stringify(errorData)}`;
        } catch (jsonError) {
          // Se não for JSON, tenta ler como texto
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 200)}...`; // Limita o tamanho do texto
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        // Extrai todos os cabeçalhos únicos dos dados
        const allHeaders = Array.from(new Set(result.flatMap(Object.keys)));
        // Filtra e ordena os cabeçalhos para corresponder à ordem desejada
        const orderedHeaders = defaultTableHeaders.filter(header => allHeaders.includes(header));
        // Adiciona quaisquer outros cabeçalhos que não estejam na lista padrão, mas que existam nos dados
        const remainingHeaders = allHeaders.filter(header => !defaultTableHeaders.includes(header));
        setTableHeaders([...orderedHeaders, ...remainingHeaders]);

        // Inicializa as opções de filtro
        const initialFilterOptions = {};
        orderedHeaders.forEach(header => {
          const options = Array.from(new Set(result.map(row => row[header])))
            .filter(option => option !== null && option !== undefined && String(option).trim() !== '')
            .map(String)
            .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
          initialFilterOptions[header] = options;
        });
        setFilterOptions(initialFilterOptions);

        // Define os filtros padrão para 'Status' se ainda não estiverem definidos
        setSelectedFilterOptions(prev => {
          if (!prev['Status'] || prev['Status'].length === 0) {
            return {
              ...prev,
              'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
            };
          }
          return prev;
        });

      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders, normalizeForComparison, setSelectedFilterOptions]);

  // Efeito para carregar dados iniciais ou quando o arquivo muda
  useEffect(() => {
    if (file) {
      handleUpload();
    }
  }, [file, handleUpload]);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ao mudar de coluna
    }
  }, [sortColumn, sortDirection]);

  // Lida com a mudança no termo de busca
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a mudança nas opções de filtro de coluna
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [column]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [column]: [...currentOptions, option] };
      }
    });
  }, []);

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Alterna a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

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
  }, [filterDropdownRef]); // Removido toggleFilterDropdown daqui, pois setActiveFilterColumn é um setter estável

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // 1. Filtrar por termo de busca
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(String(row[header] || '')).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções de coluna
    currentData = currentData.filter(row => {
      return Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra
        return selectedOptions.includes(String(row[column] || ''));
      });
    });

    // 3. Contar pendências atrasadas
    let overdueCount = 0;
    currentData.forEach(row => {
      if (isOverdue(row)) {
        overdueCount++;
      }
    });
    setCurrentOverdueCount(overdueCount); // Atualiza o estado do contador

    // 4. Ordenar
    if (sortColumn) {
      currentData = [...currentData].sort((a, b) => {
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
          const normalizedA = normalizeForComparison(aValue);
          const normalizedB = normalizeForComparison(bValue);

          if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
          if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison, isOverdue]);

  // Função para exportar os dados filtrados para Excel
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Prepara os dados para o Excel, incluindo os cabeçalhos
    const ws_data = [
      tableHeaders, // Primeira linha são os cabeçalhos
      ...filteredAndSortedData.map(row => tableHeaders.map(header => {
        // Formatação especial para CNPJ / CPF para evitar problemas de número no Excel
        if (header === 'CNPJ / CPF') {
          return String(row[header] || '').replace(/['"=]/g, '').trim();
        }
        return row[header];
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Definir larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 15; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 30; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 20; break;
        case 'Prestador': width = 20; break;
        case 'Justificativa do Abono': width = 30; break;
        default: width = 15; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos de célula
    const headerStyle = {
      fill: { fgColor: { rgb: "FF336699" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } }
      }
    };

    const defaultRowBaseStyle = {
      font: { color: { rgb: "FF000000" } }, // Texto preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } }
      }
    };

    const overdueRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFCCCC" } }, // Vermelho claro para atrasadas
      font: { color: { rgb: "FF990000" }, bold: true }, // Texto vermelho escuro, negrito
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } }
      }
    };

    const dueTodayRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFFFCC" } }, // Amarelo claro para vencem hoje
      font: { color: { rgb: "FF996600" }, bold: true }, // Texto laranja escuro, negrito
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
        left: { style: "thin", color: { rgb: "FFCCCCCC" } },
        right: { style: "thin", color: { rgb: "FFCCCCCC" } }
      }
    };

    const abonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" }
    };

    // Aplica estilos aos cabeçalhos
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { v: null }; // Garante que a célula existe
      ws[cellAddress].s = headerStyle;
    }

    // Aplica estilos aos dados
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Começa da linha 1 (dados)
      const originalRowData = filteredAndSortedData[R - 1]; // Pega os dados originais da linha
      let baseStyleForDataRow = defaultRowBaseStyle;

      if (isOverdue(originalRowData)) {
        baseStyleForDataRow = overdueRowBaseStyle;
      } else if (isDueToday(originalRowData)) {
        baseStyleForDataRow = dueTodayRowBaseStyle;
      }

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { v: null }; // Garante que a célula existe

        let currentCellStyle = { ...baseStyleForDataRow }; // Copia o estilo base da linha

        const header = tableHeaders[C]; // Pega o cabeçalho da coluna

        // Estilos e valores específicos para 'Data Limite'
        if (header === 'Data Limite') {
          const cellValue = originalRowData[header];
          const date = parseDateForComparison(cellValue);
          if (date && !isNaN(date)) {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
            const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
            const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
            ws[cellAddress].v = excelDate;
            ws[cellAddress].t = 'n'; // Tipo numérico para datas
            currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          } else {
            ws[cellAddress].v = cellValue;
            ws[cellAddress].t = 's'; // Tipo string
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          }
        }
        // Estilos e valores específicos para 'Justificativa do Abono'
        else if (header === 'Justificativa do Abono') {
          if (isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            ws[cellAddress].v = 'FALTA ABONAR';
            ws[cellAddress].t = 's';
            Object.assign(currentCellStyle, abonarCellStyle); // Mescla o estilo de abonar
          } else {
            ws[cellAddress].v = originalRowData[header];
            ws[cellAddress].t = 's';
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
          }
        }
        // Estilos e valores específicos para 'CNPJ / CPF'
        else if (header === 'CNPJ / CPF') {
          ws[cellAddress].v = String(originalRowData[header] || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Tipo string para garantir que não seja interpretado como número
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        }
        // Estilos para outras colunas
        else {
          ws[cellAddress].v = originalRowData[header];
          ws[cellAddress].t = typeof originalRowData[header] === 'number' ? 'n' : 's';
          switch (header) {
            case 'Chamado':
            case 'Numero Referencia':
            case 'Status':
            case 'Cidade':
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
              break;
            default:
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
              break;
          }
        }
        ws[cellAddress].s = currentCellStyle; // Atribui o estilo final à célula
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredAndSortedData, tableHeaders, todayFormatted, isOverdue, isDueToday, parseDateForComparison, isAbonarCondition, normalizeForComparison]);


  return (
    <div className="App">
      <div className="header-container">
        <div className="header-content">
          <div className="logo-and-title">
            <h1>Painel de Pendências</h1>
          </div>

          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange} /* <-- CORRIGIDO AQUI: Chamando handleFileChange */
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="action-button upload-button">
                <FontAwesomeIcon icon={faUpload} /> Upload CSV
              </label>
              {file && <span className="file-name">{file.name}</span>}
            </div>

            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar na tabela..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <button onClick={exportToExcel} disabled={data.length === 0} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências Hoje
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="error-message">Erro: {error}</p>}
      {loading && <p>Carregando dados...</p>}

      {data.length > 0 && (
        <div className="table-container">
          <div className="overdue-count-display">
            <h3>Pendências Atrasadas: {currentOverdueCount}</h3>
          </div>
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
