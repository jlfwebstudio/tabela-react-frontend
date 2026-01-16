// frontend/src/App.js
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
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

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

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status);
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Tenta criar uma data diretamente
    let date = new Date(dateString);

    // Se a data for inválida, tenta parsear no formato DD/MM/YYYY ou YYYY-MM-DD
    if (isNaN(date.getTime())) {
      const partsDDMMYYYY = dateString.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      const partsYYYYMMDD = dateString.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);

      if (partsDDMMYYYY) {
        date = new Date(`${partsDDMMYYYY[3]}-${partsDDMMYYYY[2]}-${partsDDMMYYYY[1]}T00:00:00`);
      } else if (partsYYYYMMDD) {
        date = new Date(`${partsYYYYMMDD[1]}-${partsYYYYMMDD[2]}-${partsYYYYMMDD[3]}T00:00:00`);
      } else {
        // Se ainda não conseguir, tenta com o formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
        try {
          date = new Date(dateString);
        } catch (e) {
          console.warn("Could not parse date string:", dateString, e);
          return dateString; // Retorna a string original se tudo falhar
        }
      }
    }

    if (isNaN(date.getTime())) {
      return dateString; // Retorna a string original se a data ainda for inválida
    }

    // Formata para DD/MM/AAAA
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, []);

  // Função para formatar CNPJ/CPF
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    // Remove aspas, sinal de igual e qualquer caractere não numérico
    const cleaned = String(value).replace(/["=]/g, '').replace(/\D/g, '');

    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Função para determinar a classe da linha com base na Data Limite e Justificativa
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    const dataLimite = new Date(dataLimiteStr);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Zera o horário para comparar apenas a data

    // Se a data limite for inválida, não aplica classe
    if (isNaN(dataLimite.getTime())) return '';

    // Data Limite é anterior a hoje
    if (dataLimite < hoje) {
      // Se não há justificativa, é "vermelho forte"
      if (!justificativa || justificativa.trim() === '') {
        return 'overdue-row-strong';
      }
      // Se há justificativa, é "vermelho normal" (não há classe específica para isso, mas pode ser adicionada se necessário)
      // Por enquanto, retorna vazio para não aplicar o vermelho forte se abonado
      return '';
    }
    // Data Limite é hoje
    if (dataLimite.toDateString() === hoje.toDateString()) {
      return 'due-today-row';
    }

    return '';
  }, []);

  // Função para obter o conteúdo da célula e sua classe CSS
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Lógica específica para a coluna 'Justificativa do Abono'
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (dataLimiteStr) {
        const dataLimite = new Date(dataLimiteStr);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (!isNaN(dataLimite.getTime()) && dataLimite < hoje && (!justificativa || justificativa.trim() === '')) {
          content = 'FALTA ABONAR';
          className = 'falta-abonar-cell';
        }
      }
    } else if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Garante que 'Serviço' e 'Técnico' não apareçam vazios se houver dados
    if ((header === 'Serviço' || header === 'Técnico' || header === 'Prestador' || header === 'Cliente') && !content) {
      content = row[header] || ''; // Usa o valor original se 'content' foi modificado para vazio
    }

    return { content, className };
  }, [formatDataLimite, formatCnpjCpf]);


  // Efeito para carregar dados do backend
  const fetchData = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file); // 'file' deve corresponder ao nome do campo no backend (multer)

      // Use a variável de ambiente para a URL do backend
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      console.log(`Enviando requisição para: ${backendUrl}/upload`);

      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // --- ADIÇÃO DO CONSOLE.LOG PARA DEPURAR DADOS BRUTOS ---
      console.log('--- DADOS BRUTOS RECEBIDOS DO BACKEND (Primeiras 5 linhas) ---');
      console.log(response.data.slice(0, 5));
      console.log('------------------------------------------------------------');

      // Filtra os dados para incluir apenas os status permitidos
      const filteredAndNormalizedData = response.data.filter(row => {
        const normalizedStatus = normalizeStatusValue(row['Status']);
        return allowedStatuses.includes(normalizedStatus);
      }).map(row => ({
        ...row,
        'Status': normalizeStatusValue(row['Status']) // Normaliza o status para exibição
      }));

      setData(filteredAndNormalizedData);
      setFilteredData(filteredAndNormalizedData); // Inicializa filteredData com os dados filtrados
      setActiveFilters({}); // Limpa filtros ativos ao carregar novos dados
      setSortConfig({ key: 'Data Limite', direction: 'ascending' }); // Reseta a ordenação padrão
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  }, [allowedStatuses, normalizeStatusValue]);

  // Efeito para calcular o contador de OSs em atraso
  useEffect(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      const justificativa = row['Justificativa do Abono'];

      if (!dataLimiteStr) return false;

      const dataLimite = new Date(dataLimiteStr);
      // Conta se a data limite é anterior a hoje E a justificativa está vazia
      return !isNaN(dataLimite.getTime()) && dataLimite < hoje && (!justificativa || justificativa.trim() === '');
    }).length;
    setOverdueCount(count);
  }, [filteredData]); // Depende de filteredData para re-calcular quando os dados visíveis mudam

  // Função para lidar com o upload do arquivo
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFileName(file.name);
      fetchData(file);
    }
  }, [fetchData]);

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    data.forEach(row => {
      let value = row[columnName];
      if (columnName === 'Status') {
        value = normalizeStatusValue(value);
        if (!allowedStatuses.includes(value)) {
          return; // Ignora status não permitidos no filtro
        }
      }
      values.add(value === '' ? '(Vazio)' : value);
    });
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '(Vazio)') return 1;
      if (b === '(Vazio)') return -1;
      return String(a).localeCompare(String(b));
    });
    return sortedValues;
  }, [data, allowedStatuses, normalizeStatusValue]);

  // Função para abrir/fechar o dropdown de filtro
  const toggleFilterDropdown = useCallback((header, event) => {
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Inicializa as seleções de filtro para o header atual
      const currentActiveFilters = activeFilters[header] || {};
      const initialSelections = {};
      getUniqueColumnValues(header).forEach(value => {
        initialSelections[value] = currentActiveFilters[value] !== undefined ? currentActiveFilters[value] : true;
      });
      setFilterSelections(initialSelections);

      // Calcula a posição do dropdown
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  // Função para lidar com a seleção/desseleção de filtros
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback((columnName) => {
    setActiveFilters(prev => ({
      ...prev,
      [columnName]: filterSelections
    }));
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((columnName) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName];
      return newFilters;
    });
    setOpenDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Função para selecionar/desmarcar todos os filtros de uma coluna
  const toggleSelectAll = useCallback((columnName, selectAll) => {
    const newSelections = {};
    getUniqueColumnValues(columnName).forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
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

  // Lógica de filtragem e ordenação principal
  const sortedAndFilteredData = useMemo(() => {
    let currentFilteredData = data;

    // Aplica filtros
    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = activeFilters[columnName];
      const hasActiveFilters = Object.values(selectedValues).some(Boolean); // Verifica se há pelo menos um filtro ativo
      if (hasActiveFilters) {
        currentFilteredData = currentFilteredData.filter(row => {
          let cellValue = row[columnName];
          if (columnName === 'Status') {
            cellValue = normalizeStatusValue(cellValue);
          }
          const displayValue = cellValue === '' ? '(Vazio)' : cellValue;
          return selectedValues[displayValue];
        });
      }
    });

    // Aplica ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Lógica de ordenação específica para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = new Date(aValue);
          const dateB = new Date(bValue);

          if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
          if (isNaN(dateA.getTime())) return sortConfig.direction === 'ascending' ? 1 : -1;
          if (isNaN(dateB.getTime())) return sortConfig.direction === 'ascending' ? -1 : 1;

          return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Ordenação padrão para outras colunas
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    return currentFilteredData;
  }, [data, activeFilters, sortConfig, normalizeStatusValue]);

  // Efeito para atualizar filteredData quando sortedAndFilteredData muda
  useEffect(() => {
    setFilteredData(sortedAndFilteredData);
  }, [sortedAndFilteredData]);

  // Função para solicitar ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const ws_data = [
      tableHeaders.map(header => ({ v: header, t: 's', s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4472C4" } }, alignment: { horizontal: "center", vertical: "center" } } }))
    ];

    filteredData.forEach(row => {
      const excelRow = tableHeaders.map(header => {
        const { content, className } = getCellContentAndClassName(row, header); // Pega o conteúdo formatado e a classe
        let cellStyle = {};

        // Aplica estilo de cor de fundo da linha
        const rowClass = getRowClassByDataLimite(row);
        if (rowClass.includes('overdue-row-strong')) {
          cellStyle.fill = { fgColor: { rgb: "FFCDD2" } }; // Vermelho forte
        } else if (rowClass.includes('due-today-row')) {
          cellStyle.fill = { fgColor: { rgb: "FFF9C4" } }; // Amarelo
        }

        // Aplica estilo para "FALTA ABONAR" (sobrescreve a cor da linha se necessário)
        if (className.includes('falta-abonar-cell')) {
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
          cellStyle.font = { bold: true, color: { rgb: "FFFFFF" } };
          cellStyle.alignment = { horizontal: "center", vertical: "center" };
        }

        // Estilo padrão para texto
        if (!cellStyle.font) {
          cellStyle.font = { color: { rgb: "000000" } };
        }

        // Determina o tipo da célula e o valor
        let cellValue = content;
        let cellType = 's'; // String por padrão

        if (header === 'Data Limite' && content) {
          // Tenta converter para número de data do Excel se for uma data válida
          const dateObj = new Date(row[header]); // Usa o valor original para conversão
          if (!isNaN(dateObj.getTime())) {
            cellValue = XLSX.utils.dateNum(dateObj);
            cellType = 'n'; // Número para datas
            cellStyle.numFmt = 'dd/mm/yyyy'; // Formato de data no Excel
          }
        } else if (header === 'CNPJ / CPF' && content) {
          // Garante que CNPJ/CPF seja tratado como texto para evitar formatação numérica indesejada
          cellType = 's';
        }

        return { v: cellValue, t: cellType, s: cellStyle };
      });
      ws_data.push(excelRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Chamado' || header === 'Status') width = 15;
      else if (header === 'Numero Referencia' || header === 'CNPJ / CPF') width = 20;
      else if (header === 'Contratante' || header === 'Serviço' || header === 'Cliente' || header === 'Técnico' || header === 'Prestador') width = 25;
      else if (header === 'Data Limite') width = 15;
      else if (header === 'Justificativa do Abono') width = 30;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'tabela_dados.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Monitoramento de OSs</h1>
        <div className="action-bar">
          <div className="file-upload-container">
            <input
              type="file"
              id="file-upload"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faFileUpload} /> Carregar CSV
            </label>
            {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
          </div>
          <div className="action-buttons">
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
            </button>
            <div className="overdue-count">
              OSs em Atraso (Sem Abono): <span className="count-number">{overdueCount}</span>
            </div>
          </div>
        </div>
      </header>

      {loading && <div className="loading-message">Carregando dados...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => requestSort(header)} className="sortable-header">
                        {header}
                        {sortConfig.key === header && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
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
