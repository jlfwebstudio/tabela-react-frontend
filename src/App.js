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
    setData([]); // Limpa os dados da tabela antes de um novo upload

    const formData = new FormData();
    formData.append('file', file); // Alterado de 'csvFile' para 'file' para compatibilidade com o backend

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenta ler a resposta como JSON primeiro
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          // Se não for JSON, lê como texto
          errorData = await response.text();
        }
        throw new Error(`Erro no servidor: ${response.status} - ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}`);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        setTableHeaders(defaultTableHeaders); // Define os cabeçalhos na ordem desejada
        // Recalcula as opções de filtro com base nos novos dados
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          if (header !== 'Justificativa do Abono' && header !== 'Data Limite' && header !== 'CNPJ / CPF') { // Exclui colunas que não precisam de filtro de texto simples
            const options = [...new Set(result.map(row => String(row[header] || '').trim()))].sort();
            newFilterOptions[header] = options;
          }
        });
        setFilterOptions(newFilterOptions);
      } else {
        setData([]);
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao processar o arquivo:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Lida com a ordenação da tabela
  const handleSort = useCallback((column) => {
    setSortDirection(prev =>
      sortColumn === column ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'
    );
    setSortColumn(column);
  }, [sortColumn, sortDirection]);

  // Lida com a mudança de opção de filtro
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

  // Aplica os filtros selecionados
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({ ...prev, [column]: [] }));
  }, []);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => { // <-- Linha 535 no código anterior
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []); // <--- Dependência 'normalizeForComparison' removida

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) && activeFilterColumn) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef, activeFilterColumn]); // activeFilterColumn é uma dependência importante aqui

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) {
      setCurrentOverdueCount(0);
      return [];
    }

    let filtered = data.filter(row => {
      const lowerCaseSearchTerm = normalizeForComparison(searchTerm);
      if (lowerCaseSearchTerm === '') return true;

      // Procura em todas as colunas visíveis
      return tableHeaders.some(header => {
        const cellValue = String(row[header] || '');
        return normalizeForComparison(cellValue).includes(lowerCaseSearchTerm);
      });
    });

    // Aplica filtros de coluna
    filtered = filtered.filter(row => {
      return Object.keys(selectedFilterOptions).every(column => {
        const selectedOptions = selectedFilterOptions[column];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra por esta coluna
        }
        const cellValue = String(row[column] || '').trim();
        return selectedOptions.includes(cellValue);
      });
    });

    // Ordenação
    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      let comparison = 0;

      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA && dateB) {
          comparison = dateA.getTime() - dateB.getTime();
        } else if (dateA) {
          comparison = -1;
        } else if (dateB) {
          comparison = 1;
        }
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = normalizeForComparison(aValue).localeCompare(normalizeForComparison(bValue));
      } else {
        // Tenta comparar como números se possível, caso contrário, como strings
        const numA = parseFloat(aValue);
        const numB = parseFloat(bValue);
        if (!isNaN(numA) && !isNaN(numB)) {
          comparison = numA - numB;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Atualiza o contador de pendências atrasadas
    const overdueCount = sorted.filter(row => isOverdue(row)).length;
    setCurrentOverdueCount(overdueCount);

    return sorted;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, normalizeForComparison, parseDateForComparison, tableHeaders, isOverdue]);

  // Retorna a classe CSS para a linha da tabela com base no status de atraso
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Função para exportar os dados filtrados e ordenados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Filtra apenas as pendências atrasadas para exportação
    const filteredForExport = filteredAndSortedData.filter(row => isOverdue(row));

    if (filteredForExport.length === 0) {
      alert('Não há pendências atrasadas para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => header)]; // Cabeçalhos como primeira linha

    // Mapeia os dados para o formato de array de arrays para o SheetJS
    filteredForExport.forEach(row => {
      const rowData = tableHeaders.map(header => {
        if (header === 'Data Limite') {
          return formatDataLimite(row[header]); // Formata a data para string para a visualização inicial
        }
        return row[header];
      });
      ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Define larguras das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço' || header === 'Contratante' || header === 'Cliente' || header === 'Justificativa do Abono') {
        width = 30;
      } else if (header === 'Numero Referencia') {
        width = 20;
      } else if (header === 'CNPJ / CPF') {
        width = 18;
      } else if (header === 'Data Limite') {
        width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para o cabeçalho
    const headerStyle = {
      fill: { fgColor: { rgb: "FF000080" } }, // Azul escuro (corrigido para RGB)
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco e negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Estilos base para as linhas de dados
    const overdueRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFF0000" } }, // Vermelho forte
      font: { color: { rgb: "FFFFFFFF" } }, // Texto branco
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const dueTodayRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFFF00" } }, // Amarelo
      font: { color: { rgb: "FF000000" } }, // Texto preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const defaultRowBaseStyle = {
      fill: { fgColor: { rgb: "FFFFFFFF" } }, // Branco
      font: { color: { rgb: "FF000000" } }, // Preto
      alignment: { vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    const abonarCellStyle = {
      fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco e negrito
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF000000" } },
        bottom: { style: "thin", color: { rgb: "FF000000" } },
        left: { style: "thin", color: { rgb: "FF000000" } },
        right: { style: "thin", color: { rgb: "FF000000" } },
      }
    };

    // Itera sobre as células para aplicar estilos e formatação de data
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) { // R = row index
      let originalRowData = null;
      if (R > 0) { // Para linhas de dados (ignorando o cabeçalho)
        originalRowData = filteredForExport[R - 1]; // Pega os dados originais da linha
      }

      let baseStyleForDataRow = defaultRowBaseStyle;
      if (originalRowData) {
        if (isOverdue(originalRowData)) {
          baseStyleForDataRow = overdueRowBaseStyle;
        } else if (isDueToday(originalRowData)) {
          baseStyleForDataRow = dueTodayRowBaseStyle;
        }
      }

      for (let C = range.s.c; C <= range.e.c; ++C) { // C = column index
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; // Garante que a célula exista

        let currentCellStyle = {};

        if (R === 0) { // Estilo para o cabeçalho
          currentCellStyle = { ...headerStyle };
          currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
        } else { // Estilo para as linhas de dados
          currentCellStyle = { ...baseStyleForDataRow };

          const header = tableHeaders[C];
          const cellValue = originalRowData ? originalRowData[header] : '';

          // Estilos e valores específicos para 'Data Limite'
          if (header === 'Data Limite') {
            const date = parseDateForComparison(cellValue);
            if (date && !isNaN(date)) {
              // Conversão manual de data para número de série do Excel
              const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de dezembro de 1899
              const diffTime = date.getTime() - excelEpoch.getTime(); // Diferença em milissegundos
              const excelDate = diffTime / (1000 * 60 * 60 * 24); // Diferença em dias
              ws[cellAddress].v = excelDate; // Atribui o número de série
              ws[cellAddress].t = 'n'; // Tipo numérico
              currentCellStyle.numFmt = 'DD/MM/YYYY'; // Formato de data
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
            } else {
              ws[cellAddress].v = cellValue;
              ws[cellAddress].t = 's';
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
            }
          }
          // Estilos e valores específicos para 'CNPJ / CPF'
          else if (header === 'CNPJ / CPF') {
            ws[cellAddress].v = String(cellValue || '').replace(/['"=]/g, '').trim();
            ws[cellAddress].t = 's';
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
          }
          // Estilos e valores específicos para 'Justificativa do Abono'
          else if (header === 'Justificativa do Abono') {
            if (isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
              Object.assign(currentCellStyle, abonarCellStyle); // Aplica o estilo de "FALTA ABONAR"
              ws[cellAddress].v = 'FALTA ABONAR';
              ws[cellAddress].t = 's';
            } else {
              ws[cellAddress].v = String(cellValue || '').trim();
              ws[cellAddress].t = 's';
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
            }
          }
          // Estilos para outras colunas
          else {
            ws[cellAddress].v = String(cellValue || '').trim();
            ws[cellAddress].t = 's';
            if (header === 'Chamado' || header === 'Numero Referencia' || header === 'Status' || header === 'Cidade' || header === 'Técnico' || header === 'Prestador') {
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "center" };
            } else {
              currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: "left" };
            }
          }
        }
        ws[cellAddress].s = currentCellStyle; // Atribui o estilo final à célula
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias Atrasadas");
    XLSX.writeFile(wb, `Pendencias_Atrasadas_${todayFormatted}.xlsx`);

  }, [filteredAndSortedData, tableHeaders, todayFormatted, isOverdue, isDueToday, parseDateForComparison, formatDataLimite, isAbonarCondition]);

  // Efeito para carregar dados iniciais ou após o upload
  useEffect(() => {
    // Se não há dados e não está carregando, tenta carregar dados do backend
    // Isso pode ser ajustado se você quiser carregar dados apenas após o upload
    // if (data.length === 0 && !loading && !error && file) {
    //   handleUpload();
    // }
  }, [data.length, loading, error, file, handleUpload]);


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
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="action-button upload-button">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              <button onClick={handleUpload} disabled={!file || loading} className="action-button">
                <FontAwesomeIcon icon={faUpload} /> {loading ? 'Carregando...' : 'Upload'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
