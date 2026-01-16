import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({}); // Filtros atualmente aplicados {columnName: {value1: true, value2: false}}
  const [filterSelections, setFilterSelections] = useState({}); // Seleções temporárias no dropdown
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0); // Contador de OSs em atraso (Data Limite < hoje)
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

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
    'Origem' // Adicionando a coluna Origem
  ], []);

  // Status permitidos para exibição e filtro
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  // Função para normalizar strings para comparação (maiúsculas, sem acentos, trim)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Função para normalizar valores de status específicos
  const normalizeStatusValue = useCallback((status) => {
    if (typeof status !== 'string') return status;
    // Remove caracteres especiais e espaços extras, mantém acentos para exibição
    return status.replace(/[^a-zA-Z0-9\sÀ-ÿ]/g, '').trim();
  }, []);

  // Função para formatar a data para exibição
  const formatDisplayDate = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // Tenta parsear no formato DD/MM/YYYY se o formato padrão falhar
        const [day, month, year] = dateString.split('/');
        const parsedDate = new Date(`${year}-${month}-${day}`);
        if (isNaN(parsedDate.getTime())) {
          return dateString; // Retorna a string original se não conseguir parsear
        }
        return parsedDate.toLocaleDateString('pt-BR');
      }
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      return dateString;
    }
  }, []);

  // Função para parsear a data para comparação (YYYY-MM-DD)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    try {
      // Tenta parsear como YYYY-MM-DD ou DD/MM/YYYY
      let date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const [day, month, year] = dateString.split('/');
        date = new Date(`${year}-${month}-${day}`);
      }
      if (isNaN(date.getTime())) return null;
      return date;
    } catch (e) {
      return null;
    }
  }, []);

  // Função para determinar a classe da linha com base na Data Limite e Justificativa
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas da data

    if (!dataLimite) return '';

    // Se a data limite é anterior a hoje
    if (dataLimite < today) {
      // Se não há justificativa ou a justificativa é vazia/irrelevante
      if (justificativa === '' || justificativa === 'FALTA ABONAR') {
        return 'overdue-row-strong'; // Vermelho forte
      }
      return 'overdue-row'; // Vermelho normal (há justificativa, mas ainda está atrasado)
    }
    // Se a data limite é hoje
    if (dataLimite.getTime() === today.getTime()) {
      return 'due-today-row'; // Amarelo
    }
    return ''; // Nenhuma classe se não estiver atrasado nem vencendo hoje
  }, [normalizeForComparison, parseDateForComparison]);

  // Função para obter o conteúdo da célula e sua classe
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Formatação específica para 'Data Limite'
    if (header === 'Data Limite') {
      content = formatDisplayDate(content);
    }

    // Formatação específica para 'CNPJ / CPF'
    if (header === 'CNPJ / CPF' && typeof content === 'string') {
      content = content.replace(/^="/, '').replace(/"$/, ''); // Remove =" e "
    }

    // Lógica para a célula "Justificativa do Abono"
    if (header === 'Justificativa do Abono') {
      const dataLimite = parseDateForComparison(row['Data Limite']);
      const justificativa = normalizeForComparison(content);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dataLimite && dataLimite < today && (justificativa === '' || justificativa === 'FALTA ABONAR')) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar'; // Classe para a célula roxa
      }
    }

    return { content, className };
  }, [formatDisplayDate, normalizeForComparison, parseDateForComparison]);

  // Efeito para buscar dados do backend ao montar o componente
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        // Tenta buscar dados do localStorage primeiro
        const storedData = localStorage.getItem('tabelaData');
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          setData(parsedData);
          setFilteredData(parsedData);
          console.log('Dados carregados do localStorage.');
        } else {
          // Se não houver dados no localStorage, tenta buscar do backend (se houver uma rota GET)
          // Atualmente, o backend só tem rota POST para upload.
          // Para um carregamento inicial, o usuário precisará fazer upload.
          // Podemos adicionar uma mensagem ou rota GET se necessário.
          console.log('Nenhum dado no localStorage. Por favor, faça o upload de um arquivo CSV.');
        }
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
        setError('Erro ao carregar dados iniciais.');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []); // Executa apenas uma vez ao montar

  // Efeito para aplicar filtros e ordenar sempre que 'data' ou 'activeFilters' ou 'sortConfig' mudar
  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplica filtros
    Object.keys(activeFilters).forEach(column => {
      const selectedValues = Object.keys(activeFilters[column]).filter(key => activeFilters[column][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = String(row[column] || '');
          return selectedValues.includes(cellValue);
        });
      }
    });

    // Filtra por allowedStatuses
    currentFilteredData = currentFilteredData.filter(row => {
      const status = normalizeStatusValue(row['Status']);
      return allowedStatuses.includes(status);
    });

    // Aplica ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        // Lógica de ordenação para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          if (dateA) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        // Ordenação padrão para outros tipos (strings)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        // Fallback para outros tipos ou valores nulos
        if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;
        if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, allowedStatuses, normalizeStatusValue, parseDateForComparison]);

  // Efeito para calcular o contador de OSs em atraso
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    filteredData.forEach(row => {
      const dataLimite = parseDateForComparison(row['Data Limite']);
      if (dataLimite && dataLimite < today) {
        count++;
      }
    });
    setOverdueCount(count);
  }, [filteredData, parseDateForComparison]);

  // Função para lidar com o upload de arquivos
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError('Nenhum arquivo selecionado.');
      return;
    }

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados existentes
    setFilteredData([]); // Limpa os dados filtrados
    setActiveFilters({}); // Limpa os filtros ativos
    setFilterSelections({}); // Limpa as seleções de filtro

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve ser 'file' para corresponder ao backend

    try {
      const response = await axios.post(process.env.REACT_APP_API_URL + '/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const processedData = response.data;
      setData(processedData);
      setFilteredData(processedData);
      localStorage.setItem('tabelaData', JSON.stringify(processedData)); // Salva no localStorage
      console.log('Upload e processamento concluídos com sucesso!');
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(`Erro ao carregar o arquivo: ${err.response.data.error}`);
      } else {
        setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      }
    } finally {
      setLoading(false);
      event.target.value = null; // Limpa o input file para permitir upload do mesmo arquivo novamente
    }
  };

  // Funções de ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) return null;
    if (sortConfig.direction === 'ascending') return faSortUp;
    return faSortDown;
  }, [sortConfig]);

  // Funções de filtro
  const getUniqueColumnValues = useCallback((column) => {
    const values = new Set();
    filteredData.forEach(row => {
      const value = row[column];
      if (value !== undefined && value !== null) {
        values.add(String(value));
      }
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return 1; // Coloca vazios no final
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    return sortedValues;
  }, [filteredData]);

  const toggleFilterDropdown = useCallback((header, event) => {
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Posiciona o dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
      // Inicializa as seleções temporárias com base nos filtros ativos
      setFilterSelections(activeFilters[header] || {});
    }
  }, [openDropdown, activeFilters]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setFilterSelections({});
    setOpenDropdown(null);
  }, []);

  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
          !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Prepara os dados para exportação, usando o conteúdo formatado e classes
    const dataForExport = filteredData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        const { content } = getCellContentAndClassName(row, header);
        newRow[header] = content;
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExport, { header: tableHeaders });

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } }, // Branco
          fill: { fgColor: { rgb: "4A4A6A" } }, // Azul escuro
          alignment: { horizontal: "left", vertical: "center" }
        };
      }
    });

    // Aplica estilos às células de dados
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row); // Obtém a classe da linha
      const baseRowBgColor = { rgb: "2A2A4A" }; // Cor de fundo padrão da célula
      let rowBgColor = baseRowBgColor;
      let rowTextColor = { rgb: "E0E0E0" }; // Cor de texto padrão

      if (rowClass === 'overdue-row-strong') {
        rowBgColor = { rgb: "CC0000" }; // Vermelho forte
        rowTextColor = { rgb: "FFFFFF" };
      } else if (rowClass === 'overdue-row') {
        rowBgColor = { rgb: "FF6666" }; // Vermelho normal
        rowTextColor = { rgb: "333333" };
      } else if (rowClass === 'due-today-row') {
        rowBgColor = { rgb: "FFFF99" }; // Amarelo
        rowTextColor = { rgb: "333333" };
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        const { content, className } = getCellContentAndClassName(row, header);

        let cellStyle = {
          font: { color: rowTextColor },
          fill: { fgColor: rowBgColor },
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "3A3A5A" } },
            bottom: { style: "thin", color: { rgb: "3A3A5A" } },
            left: { style: "thin", color: { rgb: "3A3A5A" } },
            right: { style: "thin", color: { rgb: "3A3A5A" } },
          }
        };

        // Sobrescreve o estilo da célula se for "FALTA ABONAR"
        if (className === 'falta-abonar') {
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } }; // Texto branco
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        }

        ws[cellRef].s = cellStyle; // Aplica o estilo à célula
        ws[cellRef].v = content; // Garante que o conteúdo formatado seja o valor da célula
        ws[cellRef].t = 's'; // Garante que o Excel trate como texto
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = 10; // Largura mínima padrão
      if (header === 'Serviço') minWidth = 25;
      if (header === 'Contratante') minWidth = 18;
      if (header === 'Status') minWidth = 18;
      if (header === 'Justificativa do Abono') minWidth = 30;
      if (header === 'Técnico') minWidth = 20;
      if (header === 'Prestador') minWidth = 25;
      if (header === 'Cidade') minWidth = 15;
      if (header === 'CNPJ / CPF') minWidth = 18;
      if (header === 'Numero Referencia') minWidth = 15;
      if (header === 'Data Limite') minWidth = 15;
      if (header === 'Origem') minWidth = 10; // Largura para a nova coluna Origem

      const contentWidth = Math.max(...filteredData.map(row => String(row[header] || '').length));

      return {
        wch: Math.max(minWidth, contentWidth) + 2
      };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de OSs");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'relatorio_oss.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Relatório de Ordens de Serviço</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> Carregar CSV
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">Arquivo: {selectedFileName}</span>}
        </div>

        <div className="info-actions-container">
          <div className="overdue-count">
            OSs em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
          </button>
        </div>
      </div>

      {loading && <div className="loading-message">Carregando dados...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && filteredData.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => requestSort(header)} className="sortable-header">
                        {header}
                        {getSortIcon(header) && <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(e) => toggleFilterDropdown(header, e)}
                        ref={el => filterIconRefs.current[header] = el}
                      />
                    </div>

                    {openDropdown === header && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {getUniqueColumnValues(header).map(value => (
                            <label key={value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={filterSelections[value] || false}
                                onChange={() => handleFilterSelectionChange(value)}
                              />
                              {value === '' ? '(Vazio)' : value}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => toggleSelectAll(header, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header, false)}>Desmarcar Tudo</button>
                          <button onClick={() => applyFilters(header)}>Aplicar</button>
                          <button onClick={() => clearFilters(header)}>Limpar</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
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
