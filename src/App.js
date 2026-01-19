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
  const filterButtonRefs = useRef({}); // Para fechar o dropdown ao clicar em outro botão de filtro

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
    const cleanedDateString = String(dateString).split(' ')[0].trim(); // Pega só a parte da data e limpa espaços

    // Tenta formato DD/MM/YYYY
    let parts = cleanedDateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
      if (!isNaN(date.getTime())) return date;
    }

    // Tenta formato YYYY-MM-DD (comum em alguns sistemas ou CSVs)
    parts = cleanedDateString.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }

    // Fallback para o parser nativo do Date, se os formatos específicos falharem
    const nativeDate = new Date(dateString);
    nativeDate.setHours(0, 0, 0, 0);
    return isNaN(nativeDate.getTime()) ? null : nativeDate;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString); // Chama parseDateForComparison
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  // Lógica para verificar se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dataLimite < today;
  }, [parseDateForComparison]);

  // Lógica para verificar se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Lógica para a condição "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = normalizeForComparison(row['Justificativa do Abono']);
    return isOverdue(row) && (justificativaValue === '' || justificativaValue === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);

  // Retorna a classe CSS da linha com base nas condições
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-red';
    }
    if (isDueToday(row)) {
      return 'row-yellow';
    }
    // Se não está atrasada nem vence hoje, é uma OS futura (azul clarinho)
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (dataLimite) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dataLimite > today) {
        return 'row-default-blue'; // Classe para azul clarinho
      }
    }
    return '';
  }, [isOverdue, isDueToday, parseDateForComparison]);

  // Retorna o estilo da célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: 'white',
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isAbonarCondition]);

  // Retorna o texto da célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isAbonarCondition]);

  // Função para lidar com o upload do arquivo CSV
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]);
    setTableHeaders([]);

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro do servidor: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setData(result.data);
      setTableHeaders(result.headers);

      // Gerar opções de filtro para todas as colunas
      const newFilterOptions = {};
      result.headers.forEach(header => {
        const uniqueValues = [...new Set(result.data.map(row => row[header]))].filter(Boolean).sort((a, b) => {
          if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
          }
          return 0;
        });
        newFilterOptions[header] = uniqueValues;
      });
      setFilterOptions(newFilterOptions);

      // Resetar filtros selecionados para o padrão
      setSelectedFilterOptions({
        'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
      });

    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl]);

  // Função para lidar com a mudança no input de busca
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Função para alternar o dropdown de filtro de uma coluna
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Função para lidar com a mudança de seleção de opções de filtro
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

  // Função para limpar os filtros de uma coluna
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
  }, []);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum dos botões de filtro
        const clickedOnFilterButton = Object.values(filterButtonRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterButton) {
          setActiveFilterColumn(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []); // Dependências vazias para rodar apenas uma vez

  // Filtra e ordena os dados
  const filteredAndSortedData = useMemo(() => {
    let currentData = data;

    // Aplica filtros
    currentData = currentData.filter(row => {
      return Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (selectedOptions.length === 0) return true; // Se nenhum filtro selecionado, mostra tudo
        const rowValue = normalizeForComparison(row[column]);
        return selectedOptions.some(option => normalizeForComparison(option) === rowValue);
      });
    });

    // Aplica busca
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica ordenação
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Para outros tipos de dados (strings, números)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para outros tipos ou valores mistos
        return 0;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Contador de pendências (OSs atrasadas ou vencendo hoje)
  const overdueCountDisplay = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const ws_data = [defaultTableHeaders]; // Cabeçalhos
    const exportData = filteredAndSortedData.map(row => {
      const newRow = {};
      defaultTableHeaders.forEach(header => {
        if (header === 'Data Limite') {
          const date = parseDateForComparison(row[header]);
          // Usa XLSX.utils.date_to_num para converter a data para o número de série do Excel
          newRow[header] = date ? XLSX.utils.date_to_num(date) : '';
        } else if (header === 'CNPJ / CPF') {
          // Garante que CNPJ/CPF seja tratado como texto no Excel
          newRow[header] = String(row[header] || '').replace(/['"=]/g, '').trim();
        } else if (header === 'Justificativa do Abono' && isAbonarCondition(row)) {
          newRow[header] = 'FALTA ABONAR';
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    ws_data.push(...exportData.map(row => defaultTableHeaders.map(header => row[header])));

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Estilos para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4F81BD' } }, // Azul escuro
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      },
    };

    // Aplica estilo aos cabeçalhos
    defaultTableHeaders.forEach((_, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Estilos para as linhas de dados
    const defaultBorderStyle = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const redRowStyle = { fill: { fgColor: { argb: 'FFFFC7CE' } }, border: defaultBorderStyle }; // Vermelho claro
    const yellowRowStyle = { fill: { fgColor: { argb: 'FFFFFFCC' } }, border: defaultBorderStyle }; // Amarelo claro
    const defaultBlueRowStyle = { fill: { fgColor: { argb: 'FFADD8E6' } }, border: defaultBorderStyle }; // Azul clarinho
    const abonarCellStyle = {
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Texto branco
      border: defaultBorderStyle,
    };

    // Aplica estilos condicionais às células
    for (let i = 0; i < exportData.length; i++) {
      const originalRowData = filteredAndSortedData[i]; // Acessa os dados originais para as condições
      const rowIndex = i + 1; // Linhas de dados começam na linha 1 (índice 0) no Excel

      let currentRowBaseStyle = {};
      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = redRowStyle;
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = yellowRowStyle;
      } else {
        // Se não está atrasada nem vence hoje, é uma OS futura (azul clarinho)
        const dataLimite = parseDateForComparison(originalRowData['Data Limite']);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dataLimite && dataLimite > today) {
          currentRowBaseStyle = defaultBlueRowStyle;
        }
      }

      defaultTableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = { v: exportData[i][header] }; // Garante que a célula exista com o valor
        if (!ws[cellRef].s) ws[cellRef].s = {}; // Garante que o objeto de estilo exista

        // Aplica o estilo base da linha
        Object.assign(ws[cellRef].s, currentRowBaseStyle);

        // Formatação específica para Data Limite
        if (header === 'Data Limite') {
          ws[cellRef].t = 'n'; // Tipo número para datas
          ws[cellRef].z = 'DD/MM/YYYY'; // Formato de data
        }
        // Formatação específica para CNPJ / CPF (como texto)
        else if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Tipo string
          ws[cellRef].z = '@'; // Formato de texto
        }
        // Aplica estilo "FALTA ABONAR" se a condição for atendida, sobrescrevendo o estilo da linha
        if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
          Object.assign(ws[cellRef].s, abonarCellStyle);
        }
      });
    }

    // Ajusta a largura das colunas dinamicamente
    const colWidths = defaultTableHeaders.map(header => ({
      wch: Math.max(
        header.length,
        ...exportData.map(row => String(row[header]).length)
      ) + 2 // +2 para um pequeno padding
    }));
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref'])) };

    // Congela a primeira linha (cabeçalho)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');
    XLSX.writeFile(wb, 'pendencias.xlsx');
  }, [filteredAndSortedData, defaultTableHeaders, parseDateForComparison, isAbonarCondition, isOverdue, isDueToday]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Pendências</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
          <button onClick={handleUpload} disabled={loading}>
            <FontAwesomeIcon icon={faUpload} /> {loading ? 'Processando...' : 'Carregar CSV'}
          </button>
        </div>

        <div className="search-export-section">
          <div className="search-bar">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar em todas as colunas..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <button onClick={exportToExcel} disabled={data.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
          </button>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {data.length > 0 && (
        <div className="table-info">
          <p>Total de Pendências: {overdueCountDisplay}</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <span onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon-default" />}
                      </span>
                      <div className="filter-wrapper">
                        <button
                          className="filter-button"
                          onClick={() => toggleFilterDropdown(header)}
                          ref={el => filterButtonRefs.current[header] = el} // Atribui a ref
                        >
                          <FontAwesomeIcon icon={faFilter} />
                        </button>
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
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
                              <button onClick={() => setActiveFilterColumn(null)}>Aplicar</button>
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
