import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import './App.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSortUp, faSortDown, faFilter, faUpload, faFileExcel } from '@fortawesome/free-solid-svg-icons';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' ou 'desc'
  const [filterOptions, setFilterOptions] = useState({}); // Opções disponíveis para cada filtro
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Opções selecionadas pelo usuário
  const [activeFilterColumn, setActiveFilterColumn] = useState(null); // Coluna com filtro dropdown aberto

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Define os cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
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

  // Função auxiliar para normalizar strings (remover acentos, converter para minúsculas)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/');
    // Retorna um objeto Date no formato YYYY-MM-DD para comparação correta
    return new Date(`${year}-${month}-${day}`);
  }, []);

  // Função para formatar a Data Limite para exibição
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Assume que a data já está no formato DD/MM/YYYY
    return dateString;
  }, []);

  // Funções para verificar se a OS está atrasada ou vence hoje
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return dataLimite < today;
  }, [parseDateForComparison]);

  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Função para determinar a classe CSS da linha
  const getRowClass = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar'; // eslint-disable-line no-unused-vars
    // Se a justificativa for "FALTA ABONAR" e a OS estiver atrasada, ela é vermelha
    if (isOverdue(row) && justificativa === 'falta abonar') {
      return 'row-overdue';
    }
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return 'row-default-blue'; // Cor padrão para não atrasadas e não vencendo hoje
  }, [isOverdue, isDueToday, normalizeForComparison]);

  // Função para obter o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';
    if (isOverdue(row) && isAbonar) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso
    }
    return {};
  }, [isOverdue, normalizeForComparison]);

  // Função para obter o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonar = justificativa === 'falta abonar';
    if (isOverdue(row) && isAbonar) {
      return 'FALTA ABONAR';
    }
    return row['Justificativa do Abono'];
  }, [isOverdue, normalizeForComparison]);


  // Efeito para inicializar as opções de filtro e o filtro padrão de Status
  useEffect(() => {
    if (data.length > 0) {
      const newFilterOptions = {};
      tableHeaders.forEach(header => {
        const options = [...new Set(data.map(row => row[header]))].sort((a, b) => {
          if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
          }
          return 0;
        });
        newFilterOptions[header] = options;
      });
      setFilterOptions(newFilterOptions);

      // Inicializa o filtro de Status para os 5 valores desejados
      setSelectedFilterOptions(prev => ({
        ...prev,
        'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
      }));
    }
  }, [data, tableHeaders]); // Depende de 'data' e 'tableHeaders'

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Nenhum arquivo selecionado.');
      return;
    }

    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores

    const formData = new FormData();
    formData.append('file', file);

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
      setData(result);
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}. Verifique o formato do CSV (separador ';', codificação 'latin1') e se o backend está online.`);
    } finally {
      setLoading(false);
    }
  };

  // Função para lidar com a mudança no termo de busca global
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Função para lidar com a ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Função para alternar o dropdown de filtro de coluna
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Função para lidar com a seleção de opções de filtro
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

  // Função para aplicar os filtros selecionados (fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // Função para limpar os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => {
      const newState = { ...prev };
      delete newState[column]; // Remove o filtro para esta coluna
      return newState;
    });
    setActiveFilterColumn(null); // Fecha o dropdown
  }, []);

  // Lógica de filtragem e ordenação dos dados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Aplica filtros de coluna (incluindo o filtro padrão de Status)
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row => {
          const rowValue = normalizeForComparison(row[header]);
          return selectedOptions.some(option => normalizeForComparison(option) === rowValue);
        });
      }
    });

    // 2. Aplica filtro de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm); // eslint-disable-line no-unused-vars
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 3. Aplica ordenação
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);
          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0;
        }

        // Ordenação padrão para outros tipos
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    return currentData;
  }, [data, selectedFilterOptions, searchTerm, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);


  // Calcula o número de pendentes hoje (atrasados + vencendo hoje)
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [filteredAndSortedData, isOverdue, isDueToday]);


  // Função para exportar dados para Excel com formatação
  const exportToExcel = useCallback(() => {
    const dataToExport = filteredAndSortedData.filter(row => isOverdue(row) || isDueToday(row));

    if (dataToExport.length === 0) {
      alert('Não há dados pendentes hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: tableHeaders });

    // Definir larguras das colunas
    const wscols = [
      { wch: 15 }, // Chamado
      { wch: 20 }, // Numero Referencia
      { wch: 25 }, // Contratante
      { wch: 35 }, // Serviço
      { wch: 20 }, // Status
      { wch: 15 }, // Data Limite
      { wch: 25 }, // Cliente
      { wch: 20 }, // CNPJ / CPF
      { wch: 20 }, // Cidade
      { wch: 25 }, // Técnico
      { wch: 20 }, // Prestador
      { wch: 40 }  // Justificativa do Abono
    ];
    ws['!cols'] = wscols;

    // Estilos para cabeçalhos
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2C3E50" } }, // Azul escuro
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Aplicar estilo aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Estilos para as células de dados
    for (let R = 0; R < dataToExport.length; R++) {
      const rowData = dataToExport[R];
      const rowClass = getRowClass(rowData); // Usa a mesma lógica de cor da tabela web
      const justificativaText = getJustificativaCellText(rowData); // Usa a mesma lógica de texto
      const justificativaStyle = getJustificativaCellStyle(rowData); // Usa a mesma lógica de estilo

      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
      let rowTextColor = "FF000000"; // Preto padrão

      if (rowClass === 'row-overdue') {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Branco
      } else if (rowClass === 'row-due-today') {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF000000"; // Preto
      }

      tableHeaders.forEach((header, C) => {
        const cellRef = XLSX.utils.encode_cell({ r: R + 1, c: C });
        if (!ws[cellRef]) ws[cellRef] = { v: rowData[header] || '' }; // Garante que a célula exista
        ws[cellRef].t = 's'; // Define o tipo como string para evitar problemas de formatação

        let cellStyle = {
          fill: { fgColor: { rgb: rowBgColor } },
          font: { color: { rgb: rowTextColor } },
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          }
        };

        // Aplica estilo específico para "Justificativa do Abono" se for "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && justificativaText === 'FALTA ABONAR') {
          cellStyle.fill.fgColor.rgb = "FF800080"; // Roxo intenso
          cellStyle.font.color.rgb = "FFFFFFFF"; // Branco
          cellStyle.font.bold = true;
          ws[cellRef].v = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR"
        } else if (header === 'Data Limite') {
          ws[cellRef].v = formatDataLimite(rowData[header]); // Formata a data para exibição
        } else if (header === 'CNPJ / CPF') {
          ws[cellRef].v = String(rowData[header]).replace(/\D/g, ''); // Remove caracteres não numéricos
          ws[cellRef].t = 's'; // Garante que seja tratado como texto
        } else {
          ws[cellRef].v = rowData[header];
        }

        ws[cellRef].s = cellStyle;
      });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    XLSX.writeFile(wb, "Pendentes_Hoje.xlsx");
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, getRowClass, getJustificativaCellText, getJustificativaCellStyle, formatDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {loading && <p>Processando...</p>}
            {error && <p className="error-message">{error}</p>}
          </div>

          <div className="global-actions-section">
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar na tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
          </div>
        </div>
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
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
                      </span>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${selectedFilterOptions[header] && selectedFilterOptions[header].length > 0 ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={selectedFilterOptions[header] ? selectedFilterOptions[header].includes(option) : false}
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
