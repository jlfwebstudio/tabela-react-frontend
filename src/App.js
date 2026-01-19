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

    // Fallback para o parser nativo (pode funcionar com outros formatos)
    const nativeDate = new Date(cleanedDateString);
    nativeDate.setHours(0, 0, 0, 0);
    if (!isNaN(nativeDate.getTime())) return nativeDate;

    return null; // Retorna null se não conseguir parsear
  }, []);

  // Obtém a data de hoje sem informações de hora para comparação
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    return dataLimite && dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    return dataLimite && dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    return isOverdue(row) && (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);

  // Retorna a classe CSS da linha com base nas condições
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo
    }
    return 'row-default-blue'; // Azul Clarinho para datas futuras
  }, [isOverdue, isDueToday]);

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
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isAbonarCondition]);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

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
    setFilterOptions({});
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });

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
      if (result.data && result.data.length > 0) {
        setData(result.data);
        // Garante que os cabeçalhos sejam os defaultTableHeaders na ordem correta
        setTableHeaders(defaultTableHeaders);

        // Gera opções de filtro para cada coluna
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          const options = [...new Set(result.data.map(row => String(row[header] || '')))].sort((a, b) => a.localeCompare(b));
          newFilterOptions[header] = options;
        });
        setFilterOptions(newFilterOptions);

      } else {
        setError('Nenhum dado encontrado no arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Função para lidar com a mudança no input de busca
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Função para lidar com a mudança nas opções de filtro
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

  // Função para limpar o filtro de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Função para alternar a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
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
  }, []);

  // Lógica de filtragem e ordenação dos dados
  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let filteredData = data.filter(row => {
      // Filtro por termo de busca
      const matchesSearch = searchTerm === '' ||
        Object.values(row).some(value =>
          normalizeForComparison(value).includes(normalizeForComparison(searchTerm))
        );

      // Filtro por opções de coluna
      const matchesFilters = Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (!selectedOptions || selectedOptions.length === 0) return true; // Se nenhuma opção selecionada, não filtra
        return selectedOptions.includes(String(row[column] || ''));
      });

      return matchesSearch && matchesFilters;
    });

    // Ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else {
          // Para outros tipos, tenta uma comparação numérica ou padrão
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison]);

  // Contador de pendências (OSs atrasadas ou vencendo hoje)
  const overdueCountDisplay = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);

  // Função para alternar a ordenação
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Função para exportar os dados filtrados e ordenados para Excel
  const exportToExcel = useCallback(() => {
    if (!filteredAndSortedData || filteredAndSortedData.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(filteredAndSortedData, { header: defaultTableHeaders });

    // Estilos para o Excel
    const headerStyle = {
      fill: { fgColor: { rgb: "FF4F81BD" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    const overdueRowStyle = {
      fill: { fgColor: { rgb: "FFFF0000" } }, // Vermelho
      font: { color: { rgb: "FFFFFFFF" } }, // Branco
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    const dueTodayRowStyle = {
      fill: { fgColor: { rgb: "FFFFFF00" } }, // Amarelo
      font: { color: { rgb: "FF000000" } }, // Preto
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    const defaultBlueRowStyle = {
      fill: { fgColor: { rgb: "FFADD8E6" } }, // Azul Clarinho
      font: { color: { rgb: "FF000000" } }, // Preto
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    const abonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      },
    };

    // Aplica estilos aos cabeçalhos
    defaultTableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos às células de dados
    filteredAndSortedData.forEach((row, rowIndex) => {
      const originalRowData = data.find(original => original.Chamado === row.Chamado); // Pega a linha original para usar nas condições
      const rowNum = rowIndex + 1; // Linhas de dados começam na linha 1 do Excel (0 é cabeçalho)

      let currentRowBaseStyle = defaultBlueRowStyle; // Padrão: azul clarinho
      if (isOverdue(originalRowData)) {
        currentRowBaseStyle = overdueRowStyle; // Vermelho tem prioridade
      } else if (isDueToday(originalRowData)) {
        currentRowBaseStyle = dueTodayRowStyle; // Amarelo tem segunda prioridade
      }

      defaultTableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowNum, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        // Aplica o estilo base da linha
        ws[cellRef].s = { ...currentRowBaseStyle };

        // Formatação específica para Data Limite
        if (header === 'Data Limite') {
          const date = parseDateForComparison(row[header]);
          if (date) {
            ws[cellRef].t = 'n'; // Tipo número
            ws[cellRef].v = XLSX.utils.date_to_num(date); // Converte para número de série do Excel
            ws[cellRef].z = 'DD/MM/YYYY'; // Formato de exibição
          } else {
            ws[cellRef].t = 's'; // Tipo string
            ws[cellRef].v = String(row[header] || '');
          }
        }
        // Formatação específica para CNPJ / CPF
        else if (header === 'CNPJ / CPF') {
          ws[cellRef].t = 's'; // Tipo string
          ws[cellRef].v = String(row[header] || '').replace(/['"=]/g, '').trim();
          ws[cellRef].z = '@'; // Formato de texto
        }
        // Formatação específica para Justificativa do Abono (roxo com texto "FALTA ABONAR")
        else if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
          ws[cellRef].s = { ...abonarCellStyle }; // Aplica o estilo roxo por cima
          ws[cellRef].v = 'FALTA ABONAR'; // Define o texto
          ws[cellRef].t = 's'; // Tipo string
        }
        // Para outras células, garante que o tipo seja string se não for número
        else if (typeof ws[cellRef].v !== 'number') {
          ws[cellRef].t = 's';
          ws[cellRef].v = String(row[header] || '');
        }
      });
    });

    // Ajusta a largura das colunas dinamicamente
    const colWidths = defaultTableHeaders.map(header => {
      const maxLength = Math.max(
        header.length,
        ...filteredAndSortedData.map(row => String(row[header] || '').length)
      );
      return { wch: maxLength + 2 }; // Adiciona um pouco de padding
    });
    ws['!cols'] = colWidths;

    // Adiciona autofiltro
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref'])) };

    // Congela painéis (primeira linha e primeira coluna)
    ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: 1, topLeftCell: 'B2', activeCell: 'A1' }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
    XLSX.writeFile(wb, "pendencias_exportadas.xlsx");
  }, [filteredAndSortedData, defaultTableHeaders, isOverdue, isDueToday, isAbonarCondition, parseDateForComparison, data]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Pendências</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
          <button onClick={handleUpload} disabled={loading}>
            {loading ? 'Processando...' : 'Carregar CSV'}
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>

        {data.length > 0 && (
          <div className="actions-section">
            <div className="search-bar">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em todas as colunas..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel ({overdueCountDisplay} Pendências)
            </button>
          </div>
        )}
      </div>

      {data.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} onClick={() => handleSort(header)}>
                    <div className="th-content">
                      {header}
                      <div className="sort-filter-icons">
                        {sortColumn === header && (
                          <FontAwesomeIcon icon={sortDirection === 'asc' ? faSortUp : faSortDown} className="sort-icon" />
                        )}
                        {/* Ícone de ordenação padrão se não for a coluna de ordenação atual */}
                        {sortColumn !== header && (
                          <FontAwesomeIcon icon={faSort} className="sort-icon default-sort-icon" />
                        )}
                        <div className="filter-icon-container" ref={el => filterButtonRefs.current[header] = el}>
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                            onClick={() => toggleFilterDropdown(header)}
                          />
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
