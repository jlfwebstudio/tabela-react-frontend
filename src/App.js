// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'; // Adicionado useMemo aqui
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
  // ENVOLVIDO EM useMemo para estabilizar a array e resolver o erro do ESLint
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
    'Justificativa do Abono'
  ], []); // Array de dependências vazia para criar apenas uma vez

  // Status permitidos para exibição e filtro
  // ENVOLVIDO EM useMemo para estabilizar a array e resolver o erro do ESLint
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []); // Array de dependências vazia para criar apenas uma vez

  // Função para normalizar strings para comparação (maiúsculas, sem acentos, trim)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Função para normalizar valores de status específicos
  const normalizeStatusValue = useCallback((status) => {
    if (typeof status !== 'string') return status;
    let normalized = status.trim().toUpperCase();
    // Mapeamentos específicos para unificar status
    if (normalized.includes('OS ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    // Se não houver mapeamento específico, retorna o status normalizado
    return normalized;
  }, []);

  // Função para normalizar datas para comparação (apenas DD/MM/AAAA)
  const normalizeDate = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length === 3) {
      // Formato DD/MM/AAAA
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
  }, []);

  // Efeito para aplicar filtros e ordenação sempre que 'data' ou 'activeFilters' mudar
  useEffect(() => {
    let currentFilteredData = [...data];

    // 1. Aplicar filtro de status permitido (sempre ativo)
    currentFilteredData = currentFilteredData.filter(row => {
      const normalizedStatus = normalizeStatusValue(row['Status']);
      return allowedStatuses.includes(normalizedStatus);
    });

    // 2. Aplicar filtros ativos selecionados pelo usuário
    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = activeFilters[columnName];
      const hasActiveSelection = Object.values(selectedValues).some(Boolean); // Verifica se há pelo menos um valor selecionado
      if (hasActiveSelection) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = row[columnName];
          const normalizedCellValue = normalizeForComparison(cellValue);
          // Verifica se o valor normalizado da célula está entre os valores selecionados (normalizados)
          return Object.keys(selectedValues).some(filterValue =>
            selectedValues[filterValue] && normalizeForComparison(filterValue) === normalizedCellValue
          );
        });
      }
    });

    // 3. Aplicar ordenação
    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        // Lógica de ordenação para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = normalizeDate(aValue);
          const dateB = normalizeDate(bValue);

          if (dateA && dateB) {
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0; // Se as datas forem inválidas, não altera a ordem
        }

        // Lógica de ordenação para outras colunas (string ou número)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, normalizeForComparison, normalizeStatusValue, normalizeDate, allowedStatuses]); // allowedStatuses adicionado aqui para o ESLint

  // Efeito para calcular o contador de OSs em atraso (Data Limite < hoje)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    let count = 0;
    filteredData.forEach(row => {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const justificativa = row['Justificativa do Abono'];

      // Conta apenas se a data limite passou E a justificativa NÃO for "FALTA ABONAR" (ou vazia)
      // Ou seja, se a justificativa está preenchida, não conta como "em atraso" para o contador
      if (dataLimite && dataLimite.getTime() < today.getTime() && isJustificativaVazia(justificativa)) {
        count++;
      }
    });
    setOverdueCount(count);
  }, [filteredData, normalizeDate]); // isJustificativaVazia adicionado aqui para o ESLint

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores

    const formData = new FormData();
    formData.append('csvFile', file); // O nome do campo deve ser 'csvFile' conforme o backend

    // Usa a variável de ambiente do Vercel para a URL do backend
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Erro ao fazer upload do arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
      setLoading(false);
    }
  };

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    data.forEach(row => {
      const value = row[columnName];
      if (value !== undefined && value !== null && value !== '') {
        values.add(value);
      }
    });
    // Para a coluna 'Status', filtra apenas os status permitidos
    if (columnName === 'Status') {
      return Array.from(values)
        .map(normalizeStatusValue)
        .filter(status => allowedStatuses.includes(status))
        .sort();
    }
    return Array.from(values).sort();
  }, [data, normalizeStatusValue, allowedStatuses]);

  // Função para abrir/fechar o dropdown de filtro
  const toggleFilterDropdown = useCallback((columnName, event) => {
    if (openDropdown === columnName) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(columnName);
      // Inicializa as seleções temporárias com base nos filtros ativos
      const initialSelections = activeFilters[columnName] || {};
      const uniqueValues = getUniqueColumnValues(columnName);
      const tempSelections = {};
      uniqueValues.forEach(value => {
        tempSelections[value] = initialSelections[value] !== undefined ? initialSelections[value] : true; // Por padrão, todos selecionados
      });
      setFilterSelections(tempSelections);

      // Posiciona o dropdown
      const iconRect = filterIconRefs.current[columnName].getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + 5,
        left: iconRect.left
      });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  // Lidar com cliques fora do dropdown para fechá-lo
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum ícone de filtro
        const clickedOnFilterIcon = Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterIcon) {
          setOpenDropdown(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Lidar com a mudança de seleção no filtro
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Aplicar os filtros selecionados
  const applyFilters = useCallback((columnName) => {
    setActiveFilters(prev => ({
      ...prev,
      [columnName]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  // Limpar os filtros de uma coluna
  const clearFilters = useCallback((columnName) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName]; // Remove o filtro para a coluna
      return newFilters;
    });
    setOpenDropdown(null);
  }, []);

  // Selecionar/Desmarcar todos os itens no dropdown
  const toggleSelectAll = useCallback((columnName, selectAll) => {
    const uniqueValues = getUniqueColumnValues(columnName);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Função para ordenar a tabela
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Retorna o ícone de ordenação correto
  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Função para verificar se a justificativa está vazia ou contém "FALTA ABONAR"
  const isJustificativaVazia = useCallback((justificativa) => {
    if (typeof justificativa !== 'string') return true;
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return normalizedJustificativa === '' || normalizedJustificativa.includes('FALTA ABONAR');
  }, [normalizeForComparison]);

  // Função para determinar a classe CSS da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => { // Recebe a linha inteira para verificar justificativa
    const dataLimiteStr = row['Data Limite'];
    const dataLimite = normalizeDate(dataLimiteStr);
    if (!dataLimite) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    // Compara apenas a data (ignorando a hora)
    const dataLimiteOnly = new Date(dataLimite.getFullYear(), dataLimite.getMonth(), dataLimite.getDate());

    // Se a data limite passou E a justificativa está vazia, a linha é vermelha forte
    if (dataLimiteOnly.getTime() < today.getTime() && isJustificativaVazia(row['Justificativa do Abono'])) {
      return 'overdue-row-strong'; // Vermelho mais forte para atrasado e sem abono
    }
    // Se a data limite passou E a justificativa NÃO está vazia, a linha é vermelha normal
    else if (dataLimiteOnly.getTime() < today.getTime()) {
      return 'overdue-row'; // Vermelho normal para atrasado mas com abono
    }
    // Se a data limite é hoje
    else if (dataLimiteOnly.getTime() === today.getTime()) {
      return 'due-today-row'; // Amarelo sutil para vencendo hoje
    }
    return ''; // Nenhuma classe especial
  }, [normalizeDate, isJustificativaVazia]);

  // Função para obter o conteúdo da célula e a classe CSS
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Formatação específica para CNPJ / CPF
    if (header === 'CNPJ / CPF' && typeof content === 'string') {
      content = content.replace(/="|"/g, ''); // Remove =" e aspas duplas no final
    }

    // Formatação específica para Data Limite (apenas data)
    if (header === 'Data Limite' && typeof content === 'string') {
      content = content.split(' ')[0]; // Pega apenas a parte da data
    }

    // Lógica para "Justificativa do Abono"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dataLimiteOnly = dataLimite ? new Date(dataLimite.getFullYear(), dataLimite.getMonth(), dataLimite.getDate()) : null;

      // Se a data limite passou E a justificativa está vazia, exibe "FALTA ABONAR" em roxo
      if (dataLimiteOnly && dataLimiteOnly.getTime() < today.getTime() && isJustificativaVazia(content)) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar'; // Classe para roxo
      }
    }

    return { content, className };
  }, [isJustificativaVazia, normalizeDate]);


  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Mapeia os cabeçalhos para o formato que o XLSX.utils.json_to_sheet espera
    const headerMap = tableHeaders.reduce((acc, header) => {
      acc[header] = header; // Mantém o mesmo nome para o cabeçalho
      return acc;
    }, {});

    // Prepara os dados para exportação, aplicando as mesmas transformações visuais
    const dataForExport = filteredData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        const { content } = getCellContentAndClassName(row, header);
        newRow[header] = content;
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExport, { header: tableHeaders });

    // Estilos para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4A4A6A" } }, // Cor de fundo do cabeçalho
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "5A5A7A" } },
        bottom: { style: "thin", color: { rgb: "5A5A7A" } },
        left: { style: "thin", color: { rgb: "5A5A7A" } },
        right: { style: "thin", color: { rgb: "5A5A7A" } },
      }
    };

    // Aplica o estilo ao cabeçalho
    tableHeaders.forEach((header, i) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });

    // Estilos para as células de dados
    filteredData.forEach((row, rowIndex) => {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dataLimiteOnly = dataLimite ? new Date(dataLimite.getFullYear(), dataLimite.getMonth(), dataLimite.getDate()) : null;

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        let cellStyle = {
          border: {
            top: { style: "thin", color: { rgb: "4A4A6A" } },
            bottom: { style: "thin", color: { rgb: "4A4A6A" } },
            left: { style: "thin", color: { rgb: "4A4A6A" } },
            right: { style: "thin", color: { rgb: "4A4A6A" } },
          },
          font: { color: { rgb: "E0E0E0" } } // Cor da fonte padrão
        };

        // Cor de fundo da linha (vermelho/amarelo)
        // Usando as mesmas classes CSS para consistência de cores
        const rowClass = getRowClassByDataLimite(row);

        if (rowClass === 'overdue-row-strong') {
          cellStyle.fill = { fgColor: { rgb: "FF0000" } }; // Vermelho forte
        } else if (rowClass === 'overdue-row') {
          cellStyle.fill = { fgColor: { rgb: "FF6666" } }; // Vermelho normal
        } else if (rowClass === 'due-today-row') {
          cellStyle.fill = { fgColor: { rgb: "FFFF99" } }; // Amarelo sutil
        } else {
          cellStyle.fill = { fgColor: { rgb: "2A2A4A" } }; // Cor padrão da linha (fundo da tabela)
        }

        // Cor roxa para "FALTA ABONAR" (sobrescreve a cor da linha)
        if (header === 'Justificativa do Abono') {
          const { content } = getCellContentAndClassName(row, header);
          if (content === 'FALTA ABONAR') {
            cellStyle.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
            cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
          }
        }

        ws[cellRef].s = cellStyle;
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = header.length; // Largura mínima baseada no cabeçalho
      // Larguras específicas para colunas que precisam de mais espaço
      if (header === 'Serviço') minWidth = 25;
      if (header === 'Contratante') minWidth = 18;
      if (header === 'Status') minWidth = 18;
      if (header === 'Justificativa do Abono') minWidth = 30;
      if (header === 'Técnico') minWidth = 20;
      if (header === 'Prestador') minWidth = 25;
      if (header === 'Cidade') minWidth = 15;
      if (header === 'CNPJ / CPF') minWidth = 18;
      if (header === 'Numero Referencia') minWidth = 15; // Reduzido um pouco
      if (header === 'Data Limite') minWidth = 15; // Ajustado para DD/MM/YYYY

      // Encontra a largura máxima do conteúdo da coluna
      const contentWidth = Math.max(...filteredData.map(row => String(row[header] || '').length));

      return {
        wch: Math.max(minWidth, contentWidth) + 2 // Adiciona um padding
      };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de OSs");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'relatorio_oss.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, normalizeDate, getRowClassByDataLimite]);


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
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}> {/* Passa a linha inteira */}
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
